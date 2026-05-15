type PuraReplyQualityOptions = {
  allowBullets?: boolean;
  maxLength?: number;
};

const CANNED_CLOSER_RE = new RegExp(
  String.raw`(?:^|\n)\s*(?:if you need(?: any)? further assistance.*|if there's anything else(?: you'd like to do)?[, ]+just let me know.*|let me know if you need(?: anything else| any further modifications)?.*|for more details(?: or to take further action)?,? you can .*|for more information on .*|you can continue editing or publish it later\.?|you can view and manage .* here\.?|you can manage .* here\.?|if you want to review or adjust any other settings, you can check them here\.?|if you need to look for more details, you can check the reviews section\.?|you can check out more about the lead scraping process here\.?|\[[^\]]+\]\(https?:\/\/[^)]+\))\s*(?=\n|$)`,
  "gim",
);
const GENERIC_FOLLOWUP_RE = new RegExp(
  String.raw`(?:\s|^)(?:what would you like to do next\?|would you like to do anything else\?|is there anything specific you'd like to do next\?|is there anything specific you would like to change or add(?: to this draft)?\?|is there anything specific you'd like to adjust or add(?: to this draft)?\?|would you like to address this issue now\?|would you like to address this\?|would you like to review or publish the draft now\?|would you like to review any specific sections or make additional changes\?|would you like to review the error details(?: related to [^?]+)?\?|would you like to review the details of the error\?|would you like to make any changes to the draft\?|would you like to proceed with any of these times\?|would you like to proceed with any changes\?|would you like to make any adjustments to the template\?|would you like to explore that further\?|what adjustments would you like to make\?|is there a specific area you want to explore further(?:,? like [^?]+)?\?|do you have any specific areas? in mind(?: that you want to focus on)?\?|what specifically do you want to know about [^?]+\?|is that area ready as well\?|if you need .*?just let me know!?|if you (?:want|have) .*?(?:adjustments|changes?|further instructions)(?: in mind)?[, ]+just let me know!?|if you'd like\.?|if you'd like a summary of the changes made, just ask!?|if you'd like to review the campaign details, you can check it out .*|if you'd like to review the updated availability, you can check it .*|if you'd like to check (?:it|them) out, here's the link:?|if you'd like to check the newsletter settings, you can view them .*|if you'd like to take a look, check it out .*|if you're looking for more information, you can check out .*|if you want to check(?: out)? .*|if you want to explore .*|if you want to check it out or make any adjustments, you can visit .*|if you need to adjust anything or want to clarify .*?just let me know!?|if you need to check the details or make adjustments, you can do so .*|if you need to review it or make further adjustments, just let me know!?|if you have any specific preferences or need further assistance, just let me know!?|if you have any more questions, just let me know!?|if you have any questions, feel free to ask!?|if you need more information, feel free to ask!?|if you need to download or share the image, just let me know!?|if you need anything else, feel free to ask!?|if you have any further adjustments or questions about this setup, feel free to ask!?|if you have any specific aspects you want to explore further, feel free to ask!?|if you have specific concerns about (?:any )?(?:components|areas|parts)[^.?!\n]*feel free to (?:ask|share)!?|if there'?s anything else.*just let me know!?|you can (?:check (?:it|them) out here|view it here|review the details here|check more details in the booking service|check or manage this further here)\.?|you can [^.\n]{0,220}\[[^\]]+\]\([^\)]+\)\.?|for more details[^.\n]{0,220}\[[^\]]+\]\([^\)]+\)\.?|could you clarify what you mean by [^?]+\?)(?=\s|$)`,
  "gim",
);

const PLACEHOLDER_LINK_RE = /\[([^\]]+)\]\((https?:\/\/(?:(?:www\.)?example\.(?:com|org|net)|yourdomain\.com|your-portal-url|your-portal-link|yourportal\.com|yourlinkurl\.com|yourlink\.com|yourapp\.com)[^)]+)\)/gi;
const PLACEHOLDER_URL_RE = /https?:\/\/(?:(?:www\.)?example\.(?:com|org|net)|yourdomain\.com|your-portal-url|your-portal-link|yourportal\.com|yourappurl\.com|yourlinkurl\.com|yourlink\.com|yourapp\.com)[^\s)]*/gi;
const INTERNAL_ID_RE = /\s+(?:with|under)(?: the)?\s+(?:ID|slug)\s+[*`"]{0,2}[a-z0-9-]{8,120}[*`"]{0,2}\b/gi;
const INTERNAL_CODE_RE = /`?[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\(\)`?/gi;
const BARE_UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const HEADING_RE = /^#{1,6}\s+/;
const BULLET_RE = /^\s*[-*]\s+/;
const NUMBERED_LIST_RE = /^\s*\d+\.\s+/;

function flattenSimpleLists(text: string): string {
  const out: string[] = [];
  const buffer: string[] = [];

  const flush = () => {
    if (!buffer.length) return;
    out.push(
      buffer
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (/[.!?]["')\]]?$/.test(item) ? item : `${item}.`))
        .join(" "),
    );
    buffer.length = 0;
  };

  for (const rawLine of String(text || "").split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flush();
      if (out[out.length - 1] !== "") out.push("");
      continue;
    }

    if (BULLET_RE.test(trimmed) || NUMBERED_LIST_RE.test(trimmed)) {
      const item = trimmed
        .replace(BULLET_RE, "")
        .replace(NUMBERED_LIST_RE, "")
        .trim()
        .replace(/[;,:]+$/g, "")
        .trim();
      if (item) buffer.push(item);
      continue;
    }

    flush();
    out.push(rawLine);
  }

  flush();
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function cleanPuraGeneratedReply(raw: string, opts: PuraReplyQualityOptions = {}): string {
  const allowBullets = Boolean(opts.allowBullets);
  const maxLength = Number.isFinite(opts.maxLength) ? Math.max(200, Math.floor(opts.maxLength as number)) : 12_000;

  const lines = String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(PLACEHOLDER_LINK_RE, "$1")
    .replace(PLACEHOLDER_URL_RE, "")
    .replace(INTERNAL_ID_RE, "")
    .replace(INTERNAL_CODE_RE, "")
    .replace(BARE_UUID_RE, "")
    .replace(CANNED_CLOSER_RE, "")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line, index, arr) => {
      if (!line.trim()) {
        const prev = arr[index - 1] || "";
        return Boolean(prev.trim());
      }
      if (HEADING_RE.test(line) && !allowBullets) return false;
      return true;
    });

  const flattened = flattenSimpleLists(
    lines
      .join("\n")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/^([^\n:.]{0,80}here(?:'|’)s what you have:)\s*$/gim, "")
    .replace(/^([^\n:.]{0,100}here are the calls that went through:)\s*$/gim, "")
    .replace(/^([^\n:.]{0,100}here are their names:)\s*$/gim, "")
    .replace(/^(?:i(?:'|’)ve|i have|i)\s+(?:retrieved|listed|found|checked|gathered)\b[^.?!\n]*[.?!]\s+(?=[A-Z0-9"])/gim, "")
    .replace(/^(?:i(?:'|’)ve|i have|i)\s+(?:retrieved|listed|found|checked|gathered)\b[^\n]*:\s*$/gim, ""),
  );

  const normalized = flattened
    .replace(/\bhowever,?\s+this work isn['’]t finished yet,? as i need to know exactly which specific areas or records you'd like me to target(?: for [^.?!\n]+)?\.?/gi, "")
    .replace(/\bcould you please specify(?: that)?\??/gi, "")
    .replace(/\bstopped that run\.\s*i paused before taking the next step, so nothing else will be changed until you tell me what to do next\.?/gi, "")
    .replace(/^(?:i successfully|i was able to)\s+(?:retrieve|retrieved|list|listed|find|found|gather|gathered)\b[^.?!\n]*[.?!]\s*/gim, "")
    .replace(/^all requested updates were executed successfully\.?(?:\s+|\n+)*/i, "")
    .replace(/^all your updates have been executed successfully\.?(?:\s+|\n+)*/i, "")
    .replace(/^all the requested updates were made successfully\.?(?:\s+|\n+)*/i, "")
    .replace(/^all steps for updating [^.\n]+ have been completed\.?(?:\s+|\n+)*/i, "")
    .replace(/^here(?:'|’)s a summary of what was done:\s*(?:\n+)?/i, "")
    .replace(/^here(?:'|’)s what was done:\s*(?:\n+)?/i, "")
    .replace(/\bthe html for your hosted page has been generated\.?/gi, "The update is ready.")
    .replace(/\bi(?:'|’)ve generated the html for your hosted page\.?/gi, "The update is ready.")
    .replace(/\bthe html for the hosted page has been generated\.?/gi, "The update is ready.")
    .replace(/\bthe hosted page html generation is complete\.?/gi, "The update is complete.")
    .replace(/\bi generated updated hosted-page html you can preview, refine, or publish next\.?/gi, "The updated page is ready to review.")
    .replace(/\bi(?:'|’)ve generated the html for your ([a-z ]+?) page with ([^.]+)\.?/gi, "I updated the $1 page with $2.")
    .replace(/\bi generated the html for your ([a-z ]+?) page with ([^.]+)\.?/gi, "I updated the $1 page with $2.")
    .replace(/\bi(?:'|’)ve generated the html for your ([a-z ]+), enhancing (?:its|the) style to feel ([^.]+)\.?/gi, "I updated the $1 to feel $2.")
    .replace(/\bi generated the html for your ([a-z ]+), enhancing (?:its|the) style to feel ([^.]+)\.?/gi, "I updated the $1 to feel $2.")
    .replace(/\bi generated the html for your ([a-z ]+?) page,\s*"[^"]+"\.?/gi, "I updated the $1 page.")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n\s+\n/g, "\n\n")
    .replace(GENERIC_FOLLOWUP_RE, "")
    .replace(/(?:\s|^)(?:if you|you can|for more details|for more insights|to view|to manage).{0,260}(?<!\()https?:\/\/\S+\.?/gim, "")
    .replace(/(?<!\()https?:\/\/\S+/g, "")
    .replace(/(?:\s|\n)(?:if you|you can)\b[^.!?\n]{0,220}$/i, "")
    .replace(/(?:\s|\n)what specific(?:ally)? [^?]+\?$/i, "")
    .replace(/(?:\s|\n)however,? you (?:didn't|did not) mention anything about [^.?!\n]+[.?!]?$/i, "")
    .replace(/\beverything went smoothly(?: with [^.\n]+)?\.?/gi, "")
    .replace(/\byou can check the details or try again here\.?/gi, "")
    .replace(/\bif you need more information or want to explore further[^.?!\n]*[.?!]?/gi, "")
    .replace(/\byou can (?:view|check) the details here\.?/gi, "")
    .replace(/\bfor you to make any adjustments\.?/gi, "")
    .replace(/\bto review it or make further adjustments, just let me know!?/gi, "")
    .replace(/\bto review your booking settings\b/gi, "")
    .replace(/\bto book one of these slots\b/gi, "")
    .replace(/\bto check out the review or manage responses\b/gi, "")
    .replace(/\bto explore more about your reviews\b/gi, "")
    .replace(/\bif you have specific concerns about [^.?!\n]+please let me know!?/gi, "")
    .replace(/\bif you need more information, feel free to ask!?/gi, "")
    .replace(/\bif you have any specific aspects you want to explore further, feel free to ask!?/gi, "")
    .replace(/\bif there['’]s a specific area you['’]d like to explore further, just let me know!?/gi, "")
    .replace(/\bif you have specific concerns about (?:any )?(?:components|areas|parts)[^.?!\n]*feel free to (?:ask|share)!?/gi, "")
    .replace(/\bhowever,? i didn['’]t find any details regarding the booking setup\.?/gi, "")
    .replace(/\bhowever,? you didn['’]t mention anything specific about the booking setup[^.?!\n]*\.?/gi, "")
    .replace(/\byou can check it out and make any adjustments you need [^.?!\n]*here\.?/gi, "")
    .replace(/\byou can check or manage this further here\.?/gi, "")
    .replace(/\byou can check them out in the media library\.?/gi, "")
    .replace(/\byou can check out the details in the media library here\.?/gi, "")
    .replace(/\byou can view it in the media library here\.?/gi, "")
    .replace(/\byou can check it out in the media library here\.?/gi, "")
    .replace(/\byou can view it in your nurture campaigns here\.?/gi, "")
    .replace(/\byou can check the updated details here\.?/gi, "")
    .replace(/\byou can review the updated settings here\.?/gi, "")
    .replace(/\byou can view the updated availability here\.?/gi, "")
    .replace(/\byou can take a look at the newsletter service for more details\.?/gi, "")
    .replace(/\byou can check out more details in the lead scraping section of the portal here\.?/gi, "")
    .replace(/\byou can check out more about the lead scraping process here\.?/gi, "")
    .replace(/\byou can check the booking service\.?/gi, "")
    .replace(/\byou can explore them further in the media library\.?/gi, "")
    .replace(/\byou can check the funnel here(?: for more details)?\.?/gi, "")
    .replace(/\byou can view and edit it here\.?/gi, "")
    .replace(/\byou can edit the page here\.?/gi, "")
    .replace(/\byou can check them here\.?/gi, "")
    .replace(/\byou can view more details here\.?/gi, "")
    .replace(/\byou can head over to the newsletter services page\.?/gi, "")
    .replace(/\byou can check it out in your media library here\.?/gi, "")
    .replace(/\byou can check it out in the nurture campaigns section(?: here)?\.?/gi, "")
    .replace(/\byou can view the updated campaign here\.?/gi, "")
    .replace(/\byou can find it in your nurture campaigns\.?/gi, "")
    .replace(/\byou can find it in the nurture campaigns section\.?/gi, "")
    .replace(/\byou can view it in the nurture campaigns section\.?/gi, "")
    .replace(/\byou can view the updated campaign details in the nurture campaigns section\.?/gi, "")
    .replace(/\byou can find the updated details in the nurture campaigns section\.?/gi, "")
    .replace(/\byou can see it here\.?/gi, "")
    .replace(/\byou can explore it further in your nurture campaigns here\.?/gi, "")
    .replace(/\byou can check the reviews section\.?/gi, "")
    .replace(/\byou can see it in the reviews section\.?/gi, "")
    .replace(/\byou can check out the lead scraping service\.?/gi, "")
    .replace(/\byou can check it out in the lead scraping section here\.?/gi, "")
    .replace(/\byou can view the lead scraping details in the portal at the lead scraping service\.?/gi, "")
    .replace(/\byou can visit the booking settings\.?/gi, "")
    .replace(/\byou can check them out in the booking section of the portal here\.?/gi, "")
    .replace(/\byou can view more details in the booking section\.?/gi, "")
    .replace(/\byou can view more details in the lead scraping service\.?/gi, "")
    .replace(/\byou can check the updated settings in the booking form settings\.?/gi, "")
    .replace(/\byou can view and edit this page here\.?/gi, "")
    .replace(/\byou can view and edit the layout here\.?/gi, "")
    .replace(/\byou can check on the review or make any further adjustments[^.?!\n]*\.?/gi, "")
    .replace(/\bif you have specific areas you want to dive deeper into,? just let me know!?/gi, "")
    .replace(/\bif you need\s*,\s*you can visit [^.?!\n]*\.?/gi, "")
    .replace(/\bif you['’]re looking for reviews, you might want to check back later or explore other sections[^.?!\n]*\.?/gi, "")
    .replace(/\byou can check the updated settings in the booking settings\.?/gi, "")
    .replace(/\byou can access the live booking link here\.?/gi, "")
    .replace(/\bthe current booking settings confirm these changes:\s*the title is\s*"([^"]+)",\s*the description is as specified,\s*and the meeting duration is\s*(\d+)\s*minutes\.?/gi, 'Current booking title: "$1". Current meeting duration: $2 minutes.')
    .replace(
      /\bthe current booking settings are confirmed as follows:\s*title:\s*"([^"]+)",\s*description:\s*"([^"]+)",\s*and duration:\s*(\d+)\s*minutes\.?/gi,
      'Current booking title: "$1". Current booking description: "$2". Current meeting duration: $3 minutes.',
    )
    .replace(/\n?\s*and access the live booking link\s+\[here\]\([^)]*\)\.?/gi, "")
    .replace(/\byou can check the details in the newsletter service\.?/gi, "")
    .replace(/\bto access it, you can do so (?:in the newsletter section|here)\.?/gi, "")
    .replace(/\byou can refine it further before sending\.?/gi, "")
    .replace(/\byou can refine it further or proceed with sending it when you're ready\.?/gi, "")
    .replace(/\byou can refine and send it when you're ready\.?/gi, "")
    .replace(/\byou can refine and send it whenever you're ready\.?/gi, "")
    .replace(/\bthe attempt to send the newsletter didn't go through due to a conflict(?: indicated by a status code of 409)?\.?/gi, "I couldn't send that newsletter because the current audience has no recipients.")
    .replace(/\bor audience for sending, you can check those in the newsletter service here\.?/gi, "")
    .replace(/\bif you need an audience for this newsletter, you can check the newsletter service\.?/gi, "")
    .replace(/\byou can explore it in the blog section here\.?/gi, "")
    .replace(/\byou can manage it further in the blog section\.?/gi, "")
    .replace(/\byou can view the changes in the booking settings\.?/gi, "")
    .replace(/\bif you want to see the changes, you can check the settings here\.?/gi, "")
    .replace(/\byou can access your live booking link here\.?/gi, "")
    .replace(/\byou can find the updated settings in the booking reminders section\.?/gi, "")
    .replace(/\bif you need to check or adjust these settings further, you can visit the booking reminders section\.?/gi, "")
    .replace(/\bif you need to view or adjust this\.?/gi, "")
    .replace(/\bif you need to view or manage this, you can do so here\.?/gi, "")
    .replace(/\bto take further action\.?/gi, "")
    .replace(/\bthe current settings confirm that email reminders are scheduled for\s*(\d+)\s*hours ahead, while sms reminders are set for\s*(\d+)\s*hours prior\.?/gi, "Email reminders go out $1 hours before appointments, and SMS reminders go out $2 hours before.")
    .replace(/\byour booking reminder settings are as follows:\s*/gi, "")
    .replace(/\bi summarized the highlights for your ai receptionist over the last 72 hours\.\s*there were no calls during this period\.\s*a key point to note is that the ai receptionist is currently disabled\.?/gi, "There were no AI receptionist calls in the last 72 hours. The AI receptionist is currently disabled.")
    .replace(/\byou can continue working on it here\.?/gi, "")
    .replace(/\byou can check the draft here\.?/gi, "")
    .replace(/\byou can view and edit the page here\.?/gi, "")
    .replace(/\byou can view the details in the nurture campaigns section\.?/gi, "")
    .replace(/\byou can see the updates in the nurture campaigns section here\.?/gi, "")
    .replace(/\byou can view the details in the media library\.?/gi, "")
    .replace(/\byou can explore the media items further in the media library\.?/gi, "")
    .replace(/\byou can take further actions or download it from the media library at the media library\.?/gi, "")
    .replace(/\byou can view the updated availability details here\.?/gi, "")
    .replace(/\byou can check the updated availability details here\.?/gi, "")
    .replace(/\byou can explore these further in the booking service\.?/gi, "")
    .replace(/\bif you need to check for new reviews later, you can visit the reviews section\.?/gi, "")
    .replace(/\byou can view the details in the reviews section\.?/gi, "")
    .replace(/\byou can view it in the reviews section\.?/gi, "")
    .replace(/\byou can reserve your spot today!?\s*to see the details\.?/gi, "")
    .replace(/\byou might want to check the (?:audience|recipient) settings[^.?!\n]*\.?/gi, "")
    .replace(/\byou might want to check the newsletter settings[^.?!\n]*\.?/gi, "")
    .replace(/\bif you need to manage the audience or any settings, you can check the newsletter service\.?/gi, "")
    .replace(/\bif you want to adjust the audience or resubmit, let me know\.?/gi, "")
    .replace(/\byou can edit it before publishing\.?/gi, "")
    .replace(/\bthe document is still in draft status, so you can review it and make any further adjustments before publishing\.?/gi, "")
    .replace(/\bit(?: is|'s) currently in draft mode, so (?:it would be wise to )?review it before finalizing\.?/gi, "")
    .replace(/\bcurrently,? the document is saved as a draft, allowing you to review it before making it live\.?/gi, "")
    .replace(/\bif you need to look for more details, you can check the reviews section\.?/gi, "")
    .replace(/\bif you need more information, just ask!?/gi, "")
    .replace(/^(?:it looks like )?i found the nurture campaigns,? but\s+/gim, "")
    .replace(/^(?:it looks like )there are currently no\b/gi, "There are currently no")
    .replace(/(?:[.!?]\s*)?for the full list, take a look at the \[[^\]]+\]\([^\)]+\)\.?/gi, "")
    .replace(/(?:[.!?]\s*)?for more details, you can check the nurture campaigns section\.?/gi, "")
      .replace(/(?:[.!?]\s*)?for a complete view, you can check the nurture campaigns section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?for additional details, you can view the manual calls section\.?/gi, "")
      .replace(/(?:[.!?]\s*)?for more details, you can check the ai chat section\.?/gi, "")
      .replace(/(?:[.!?]\s*)?to explore more about your chat threads, you can visit the ai chat section\.?/gi, "")
      .replace(/(?:[.!?]\s*)?if you want to see more details, you can check the ai chat section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?for more details, you can check the ai outbound calls section\.?/gi, "")
      .replace(/(?:[.!?]\s*)?for more details on these campaigns, you can check the ai outbound calls section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?if you need more details or want to explore any specific campaigns, you can check the ai outbound calls section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?to explore more details, you can check the ai outbound calls section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?you can see all your tasks in the tasks section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?if you want to manage these assignees, you can do so in the tasks section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?if you need more details or want to see the full list, you can check the tasks section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?if you need more details, you can check the tasks section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?if you need to check their details, you can go to the tasks section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?if you need more details, you can check the task management section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?if you want to see more about these assignees, you can check the task services section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?if you need to see more details, you can check the task (?:management|services) section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?if you need to manage task assignments, you can do so in the task services section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?if you need to manage these assignees or want more details, you can do that in the task services section here\.?/gi, "")
      .replace(/(?:[.!?]\s*)?if you need to see more details, you can find them in the task management section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?if you['’]re interested in related services, you can check the dispute letters section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?if you need to access related services, you can check the dispute letters section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?if you need to check for any updates or discrepancies, you can visit the dispute letters section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?you can check for updates later at the dispute letters section\.?/gi, "")
    .replace(/(?:[.!?]\s*)?you can check this section for updates:?\s*credit dispute letters\.?/gi, "")
    .replace(/(?:[.!?]\s*)?you can check this section for updates\.?/gi, "")
    .replace(/(?:[.!?]\s*)?you can check any related services at this link\.?/gi, "")
    .replace(/(?:[.!?]\s*)?for more details(?: or to take further action)?\.?$/i, "")
    .replace(/(?:[.!?]\s*)?for more information(?: on [^.?!\n]+)?\.?$/i, "")
    .replace(/(?:,\s*|\s+)to dive deeper into any specific automation\.?$/i, "")
    .replace(/(?:,\s*|\s+)to dive deeper into [^.?!\n]+\.?$/i, "")
    .replace(/\bfor more information\s*$/i, "")
    .replace(/(?:[.!?]\s*)?for additional details\.?$/i, "")
    .replace(/\bto see the changes\.?$/i, "")
    .replace(/\bto see the details\.?$/i, "")
    .replace(/\bto see the full list\.?$/i, "")
    .replace(/\bfor a detailed look\.?$/i, "")
    .replace(/\bto see more details\.?$/i, "")
    .replace(/\bto explore your chat threads further\.?$/i, "")
    .replace(/\bto explore or manage them, you can do so in the ai chat section\.?$/i, "")
    .replace(/\byou can review them in the ai chat section\.?$/i, "")
    .replace(/\bto review it further\.?$/i, "")
    .replace(/\bto review it\.?$/i, "")
    .replace(/\bto make any further adjustments\b/gi, "")
    .replace(/\bto see more about the reviews\b/gi, "")
    .replace(/\bto review or use the template\b/gi, "")
    .replace(/\bto check it out\b/gi, "")
    .replace(/\bto review the settings\b/gi, "")
    .replace(/\bto proceed with any of these slots\b/gi, "")
    .replace(/\bto explore more options or book a slot, check out the booking service\b/gi, "")
    .replace(/\bto explore these options further\b/gi, "")
    .replace(/\bto see it in context, you can view the details in your nurture campaigns\b/gi, "")
    .replace(/\bif you['’]re looking for more information, you can check the reviews section\.?/gi, "")
    .replace(/\bit['’]s saved as a draft, so\s*$/i, "")
    .replace(/\bit['’]s currently in draft(?: form| status)? and hasn['’]t been published yet\.?/gi, "")
    .replace(/^(I(?:'ve| have)? (?:created|tightened) [^\n]*newsletter[^\n.]*\.)\n\n[\s\S]*$/i, "$1")
    .replace(/\bif you need an audience[^.?!\n]*newsletter service[^.?!\n]*\.?/gi, "")
    .replace(/\bif you need to adjust the audience or request messages, let me know!?/gi, "")
    .replace(/\byou(?:'|’)ll need to update the audience before trying to send it again\.?(?:\s+you can make those updates in the newsletter service\.?)?/gi, "You need to update the audience before sending it again.")
    .replace(/\byou might want to check[^.?!\n]*(?:newsletter service|reviews section|booking availability section|lead scraping section|lead scraping service)[^.?!\n]*\.?/gi, "")
    .replace(/\byou can (?:view|check|edit|manage|explore)(?: [^.?!\n]+){0,10} (?:here|in the [^.?!\n]+ section|in the [^.?!\n]+ service)\.?/gi, "")
    .replace(/\bto edit the page, you can do so here\.?/gi, "")
    .replace(/\byou can make any additional changes you['’]d like\.?/gi, "")
    .replace(/\bit['’]s ready for you to edit or add content before publishing\.?/gi, "")
    .replace(/\byou can make changes in the blog section\.?/gi, "")
    .replace(/\bthis update is complete, so you can review it anytime before it goes live\.?/gi, "")
    .replace(/\byou['’]ll need to review it before it goes live\.?/gi, "")
    .replace(/\byou can check the generated html for it now\.?/gi, "")
    .replace(/\byou['’]re ready to start capturing leads!?/gi, "")
    .replace(/\byou can continue editing the page here\.?/gi, "")
    .replace(/\byou can now manage your media files there\.?/gi, "")
    .replace(/\byou can find it in the media library\.?/gi, "")
    .replace(/\bif you want to manage it further, you can head over to the media library here\.?/gi, "")
    .replace(/\byou can also edit the funnel here\.?/gi, "")
    .replace(/\byou can see the details and make any edits through this link\.?/gi, "")
    .replace(/\byou can find the updated settings here\.?/gi, "")
    .replace(/\bif you['’]re looking for something specific or need assistance with another task, just let me know!?/gi, "")
    .replace(/\bif you need assistance with those settings, let me know!?/gi, "")
    .replace(/\bsince there are currently no reviews, there(?:'s| is) nothing to display\.?/gi, "")
    .replace(/\byou can see the update in your nurture campaigns section here\.?/gi, "")
    .replace(/\byou can check it out in the media library\.?/gi, "")
    .replace(/\byou can access the media library here\.?/gi, "")
    .replace(/\byou can explore more in the media library\.?/gi, "")
    .replace(/(?:[.!?]\s*)?for a detailed view, you can visit the media library\.?/gi, "")
    .replace(/\bfor a complete view of your tasks, you can check the tasks section\.?/gi, "")
    .replace(/\byou can find more information in the reviews section\.?/gi, "")
    .replace(/\byou can check more details in your reviews section\.?/gi, "")
    .replace(/\byou can adjust your settings to send it to an audience\.?/gi, "")
    .replace(/\bthis document is still in draft status\.?/gi, "")
    .replace(/\bit['’]s currently saved as a draft for your review before going live\.?/gi, "")
    .replace(/\bit appears the demo account is much closer to being production-ready based on the sampled surfaces\.?/gi, "")
    .replace(/\beverything checked out for the demo readiness assessment\.?/gi, "")
    .replace(/\byou can see the updated form in the booking settings\.?/gi, "")
    .replace(/\byou can explore the reviews section for more details\.?/gi, "")
    .replace(/\byou can \[(?:open|download|share)\]\([^\)]+\)(?:,?\s*\[(?:open|download|share)\]\([^\)]+\)){1,}\s*(?:it now)?\.?/gi, "")
    .replace(/\bif you['’]re looking for specific information, you might want to check the \[[^\]]+\]\([^\)]+\) for updates\.?/gi, "")
    .replace(/\bif you want to see more about the media items or specific folders, just let me know!?/gi, "")
    .replace(/\bthe document is currently saved as a draft\.?/gi, "")
    .replace(/\bit['’]s currently in draft status\.?/gi, "")
    .replace(/\bthe page is currently in draft status\.?/gi, "It remains in draft.")
    .replace(/\bthis design is currently saved as a draft\.?/gi, "It remains in draft.")
    .replace(/\bthis is all set in draft\.?/gi, "It remains in draft.")
    .replace(/\bthe document is in draft status for you to review\.?/gi, "It remains in draft.")
    .replace(/\bthe document titled "[^"]+" is currently saved as a draft, so you can continue editing it from here\.?/gi, "It remains in draft.")
    .replace(/\bhowever, it remains in draft status\.?/gi, "It remains in draft.")
    .replace(/\bit includes features like [^.?!\n]+\.?/gi, "")
    .replace(/\bthe design now includes [^.?!\n]+\.?/gi, "")
    .replace(/\bif you['’]re ready to make it live or need any adjustments, just let me know!?/gi, "")
    .replace(/\byou can find more details in the nurture campaigns section\.?/gi, "")
    .replace(/\byou can find more information in the credit reports section\.?/gi, "")
    .replace(/\byou can find more details in the [^.?!\n]+(?:settings|section|service)\.?/gi, "")
    .replace(/\byou can check or adjust your settings in the [^.?!\n]+settings\.?/gi, "")
    .replace(/\byou can see more details in the [^.?!\n]+settings\.?/gi, "")
    .replace(/\byou can see more details in the [^.?!\n]+section\.?/gi, "")
    .replace(/\byou can manage it further in the [^.?!\n]+settings\.?/gi, "")
    .replace(/\byou can find the settings in the portal here\.?/gi, "")
    .replace(/\byou can (?:check|see|view|manage|find) [^.?!\n]{0,180} in the [^.?!\n]+settings\.?/gi, "")
    .replace(/\bfor more insights,? you can (?:check|see|view|find) [^.?!\n]{0,180}(?:section|page|portal)\.?/gi, "")
    .replace(/\byou can explore (?:it|this|them) further in the portal\.?/gi, "")
    .replace(/\bif you'?re looking for more details or need help with anything specific,? just let me know!?/gi, "")
    .replace(/\byou can see (?:it|them|this) in your dashboard\.?/gi, "")
    .replace(/\bif you need to update that, you can do so in the billing section\.?/gi, "")
    .replace(/\bwhat would you like to check regarding your sales reporting integration settings\??/gi, "")
    .replace(/\bif you want to see more details, you can visit the contacts section\.?/gi, "")
    .replace(/\byou can see the full list of users here\.?/gi, "")
    .replace(/\byou can explore these options in the settings\.?/gi, "")
    .replace(/\byou can find more details about your settings here\.?/gi, "")
    .replace(/\byou can find more information in the setup section\.?/gi, "")
    .replace(/\byou can find more information in the newsletter services section\.?/gi, "")
    .replace(/\byou can find more information in the [^.?!\n]+ services section\.?/gi, "")
    .replace(/\byou can access more information through the [^.?!\n]+ services section\.?/gi, "")
    .replace(/\byou can access it here\.?/gi, "")
    .replace(/\byou can check more details in the funnel builder\.?/gi, "")
    .replace(/\byou can find more about it in the funnel builder section\.?/gi, "")
    .replace(/\byou can see more details in the funnel builder service\.?/gi, "")
    .replace(/\beach with a unique id, share url, and download url\.?/gi, "")
    .replace(/\bwhich you can access or download directly at the media library\.?/gi, "")
    .replace(/\bif you need to check for updates or any other details, you can look at the [^.?!\n]+ section\.?/gi, "")
    .replace(/\bif you need to dive deeper, you can check (?:it|them|this) in your [^.?!\n]+ section\.?/gi, "")
    .replace(/\byou can find it in the lead scraping service here\.?/gi, "")
    .replace(/\bto explore more about these campaigns\.?$/i, "")
    .replace(/\bfor more insights\.?$/i, "")
    .replace(/\bfor further management\.?$/i, "")
    .replace(/\bfor a closer look at the settings\.?$/i, "")
    .replace(/\byou can find more details in your tasks section here\.?/gi, "")
    .replace(/\byou can find it in your tasks section here\.?/gi, "")
    .replace(/\byou can see more details in the booking service here\.?/gi, "")
    .replace(/\bverification token is ["'`]*[a-z0-9]{16,}["'`]*/gi, "verification token is available")
    .replace(/\bthis looks much closer to production-ready across the sampled surfaces\.?/gi, "")
    .replace(/\bit looks like no action was taken yet[^.?!\n]*[.?!]?/gi, "")
    .replace(/\bno action was taken(?: to [^.?!\n]+)?[.?!]?/gi, "")
    .replace(/\bit seems i couldn['’]t execute any steps[^.?!\n]*[.?!]?/gi, "")
    .replace(/\bi couldn['’]t create [^.?!\n]*,? but here['’]s how you can do it:?/gi, "")
    .replace(/\bi can['’]t provide specific results for [^.?!\n]*[.?!]?/gi, "")
    .replace(/\bit looks like i can['’]t find any specific steps or results[^.?!\n]*[.?!]?/gi, "")
    .replace(/\bit seems there wasn['’]t any action executed,? but /gi, "")
    .replace(/\bi didn['’]t find any action taken[^.?!\n]*[.?!]?/gi, "")
    .replace(/\bi didn['’]t take any actions,? so there are no results to share[.?!]?/gi, "")
    .replace(/\bif you need specific guidance on how to do this, let me know!?/gi, "")
    .replace(/\bif you need assistance with anything else, just let me know!?/gi, "")
    .replace(/\bif you need assistance with something else, just let me know!?/gi, "")
    .replace(/\bif you['’]re looking for more information or need help with something else, just let me know!?/gi, "")
    .replace(/\bif you['’]re looking for specific details or need assistance with something else, just let me know!?/gi, "")
    .replace(/\bif you need to take a closer look\.?$/i, "")
    .replace(/\bif you need more details or want to manage these slots\.?$/i, "")
    .replace(/\bif you need to explore these further\.?$/i, "")
    .replace(/\bif you need to adjust anything, just let me know!?/gi, "")
    .replace(/\bif you want\.?$/i, "")
    .replace(/\bto check these settings further, you can visit the ai receptionist section\.?/gi, "")
    .replace(/\bto see the complete list\.?$/i, "")
    .replace(/\bif you['’]re looking for more information or related services, you can find it here\.?/gi, "")
    .replace(/\byou can check your account for updates or try again later\.?/gi, "")
    .replace(/\bif you need more details or specific actions regarding these members, just let me know!?/gi, "")
    .replace(/\bif you want me to create [^.?!\n]* just let me know!?/gi, "")
    .replace(/\bif you want to make any changes or need more details, just let me know!?/gi, "")
    .replace(/\bif you have any specific questions about [^.?!\n]*,? feel free to ask!?/gi, "")
    .replace(/\bif you have any other questions or need help with something else,? feel free to ask!?/gi, "")
    .replace(/\bif you['’]re ready to proceed with [^.?!\n]*,? just let me know,? and i can assist you directly!?/gi, "")
    .replace(/(?:,\s*)?so you can make further adjustments before going live\.?/gi, "")
    .replace(/(?:,\s*)?so you can review it before deciding to go live\.?/gi, "")
    .replace(/(?:,\s*)?so you can review it before it goes live\.?/gi, "")
    .replace(/\bfor any updates\.?$/i, "")
    .replace(/\bfor any further actions you want to take\.?$/i, "")
    .replace(/\bif needed\.?$/i, "")
    .replace(/\bhere are some highlights:?\s*$/i, "")
    .replace(/\bto explore more about these settings\.?$/i, "")
    .replace(/\bto view the updated draft\.?$/i, "")
    .replace(/\bif you want to see the task,?\s*$/i, "")
    .replace(/\bof the portal here\.?$/i, "")
    .replace(/\bof the portal\.?$/i, "")
    .replace(/\bit now reads:\s*$/i, "")
    .replace(/\bs section\.?$/i, "")
    .replace(/\bthe subject reads\s*/gi, "")
    .replace(/\.\s{2,}(?:section|service|settings|here|there)\.?$/i, ".")
    .replace(/\bwhich\s*$/i, "")
    .replace(/\s+and\s+"New campaign\."/g, "")
    .replace(/\b(?:and|for further details|so)\s*$/i, "")
    .replace(/\bavailable for updates\b/gi, "available")
    .replace(/(?:\n\s*)?\]\(\)\.?\s*$/g, "")
    .replace(/([.!?])\s+[.!?]+/g, "$1")
    .replace(/\s*\[here\s*$/gi, "")
    .replace(/Some examples include "([^"]+)\."/g, 'Some examples include "$1"')
    .replace(/One example is "([^"]+)\."/g, 'One example is "$1"')
    .replace(/including "([^"]+)\."\s*$/i, 'including "$1".')
    .replace(/such as "([^"]+)\."\s*$/i, 'such as "$1".')
    .replace(/"([^"]+)\."\./g, '"$1."')
    .replace(/\bto explore more details\.?$/i, "")
    .replace(/\bif you want\.?$/i, "")
    .replace(/\byou can check the credit reports section\.?$/i, "")
    .replace(/(?:[.!?]\s*)?if you need to see more details, you can check the task management section\.?/gi, "")
    .replace(/\n\s*to explore more\s*$/gi, "")
    .replace(/\bto see the complete html code or any specific section, just let me know!?/gi, "")
    .replace(/(?:\s|^)and the live booking link here\.?/gi, "")
    .replace(/(?:\s|^)and the [^.?!\n]+ settings here\.?/gi, "")
    .replace(/(?:\s|^)and the [^.?!\n]+ settings \[[^\]]+\]\([^\)]+\)\.?/gi, "")
    .replace(/(?:\s|^)and the [^.?!\n]+ details here\.?/gi, "")
    .replace(/\byou can access the updated settings here\.?/gi, "")
    .replace(/\byou can access the updated booking settings here and find the live booking link here\.?/gi, "")
    .replace(/\bthe live booking link is available at this link\.?/gi, "")
    .replace(/\n\n\s*the live booking link is available/gi, "\n\nThe live booking link is available")
    .replace(/\bcurrently,?\s+the [^.?!\n]+ settings can be reviewed here\.?/gi, "")
    .replace(/\bcurrently,?\s+the [^.?!\n]+ settings are available here\.?/gi, "")
    .replace(/\bthe [^.?!\n]+ settings can be reviewed here\.?/gi, "")
    .replace(/\bthe current [^.?!\n]+ settings have also been retrieved\.?/gi, "")
    .replace(/\bthe current [^.?!\n]+ settings have been retrieved\.?/gi, "")
    .replace(/\bthe current [^.?!\n]+ settings were retrieved successfully\.?/gi, "")
    .replace(/\b(?:additionally,?\s*)?i retrieved the current [^.?!\n]+ settings\.?/gi, "")
    .replace(/\bi also retrieved the current [^.?!\n]+ settings\.?/gi, "")
    .replace(/\band check the [^.?!\n]+ settings\s*(?:\[[^\]]+\]\([^\)]+\)|here)\.?/gi, "")
    .replace(/\bif you need to check the updated [^.?!\n]+, you can do so here\.?/gi, "")
    .replace(/\bthe current [^.?!\n]+ settings are now available for you to review(?: at the \[[^\]]+\]\([^\)]+\))?\.?/gi, "")
    .replace(/\bthe current [^.?!\n]+ settings can be viewed\s*\[[^\]]+\]\([^\)]+\)\.?/gi, "")
    .replace(/\bthe [^.?!\n]+ settings are accessible\s*\[[^\]]+\]\([^\)]+\)\.?/gi, "")
    .replace(/\byou can see the updated settings in the [^.?!\n]+ section\.?/gi, "")
    .replace(/\bif you need to check the settings further\b/gi, "")
    .replace(/\bor check the \[[^\]]+\]\([^\)]+\)\.?/gi, "")
    .replace(/\byou can review the booking settings here\b/gi, "")
    .replace(/\byou can find more details about the booking settings here\b/gi, "")
    .replace(/\byou can find more information about the ai receptionist here\b/gi, "")
    .replace(/\bcurrently,?\s+to check out the booking settings, you can do so here,? and for the ai receptionist settings, click here\.?/gi, "")
    .replace(/\bthe current booking settings are as follows:\s*/gi, "")
    .replace(/\byour current booking settings are as follows:\s*/gi, "")
    .replace(/\bfor the ai receptionist, it is currently [^.?!\n]+(?:,?\s*with the greeting mentioned above)?\.?/gi, "")
    .replace(/\btop warning:\s*ai receptionist is currently disabled\.?/gi, "")
    .replace(/\bthe current settings show that the ai receptionist is [^.?!\n]+\.?/gi, "")
    .replace(/\bthe ai receptionist is currently ([^.?!\n]+)\.\s*(?:the current greeting is|the greeting is):\s*"([^"]+)"\.?\s*(?=the ai receptionist is currently \1\.\s*current greeting:\s*"\2"\.?)/gi, "")
    .replace(/\bthe greeting now reads:\s*"([^"]+)"\.?\s*(?=the ai receptionist is currently [^.?!\n]+\.\s*current greeting:\s*"\1"\.?)/gi, "")
    .replace(/\bthe greeting is:\s*"([^"]+)"\.?\s*(?=the ai receptionist is currently [^.?!\n]+\.\s*current greeting:\s*"\1"\.?)/gi, "")
    .replace(/"([^"]{1,160})"\s+and\s+"\1"/gi, '"$1"')
    .replace(/"([^"]{1,160})",\s*"\1"/gi, '"$1"')
    .replace(/;\s+(?=[A-Z"])/g, ". ")
    .replace(/[,;:\-]\s*$/g, "")
    .trim();

  const finalized = normalized.slice(0, maxLength).trim();
  if (!finalized) return finalized;
  if (allowBullets || /\n/.test(finalized)) return finalized;
  if (/[.!?]$/.test(finalized)) return finalized;
  if (/[.!?]["')\]]$/.test(finalized)) return finalized;
  if (/["')\]]$/.test(finalized) || /[A-Za-z0-9]$/.test(finalized)) return `${finalized}.`;
  return finalized;
}

export function isLowQualityPuraGeneratedReply(raw: string, opts: PuraReplyQualityOptions = {}): boolean {
  const allowBullets = Boolean(opts.allowBullets);
  const text = String(raw || "").trim();
  if (!text) return true;

  if (/^the action to\b/i.test(text)) return true;
  if (/\bthe action was\b/i.test(text)) return true;
  if (/\bcompleted successfully\b/i.test(text) && !/^i /i.test(text)) return true;
  if (/everything went smoothly/i.test(text)) return true;
  if (/\bhas been successfully (?:created|updated|sent|published)\b/i.test(text)) return true;
  if (/\bhas been (?:created|updated|sent|published) successfully\b/i.test(text)) return true;
  if (/\bwas sent successfully\b/i.test(text)) return true;
  if (/\ball requested updates were executed successfully\b/i.test(text)) return true;
  if (/\ball your updates have been executed successfully\b/i.test(text)) return true;
  if (/\ball the requested updates were made successfully\b/i.test(text)) return true;
  if (/\ball steps for updating [^.\n]+ have been completed\b/i.test(text)) return true;
  if (/here(?:'|’)s a summary of what was done:/i.test(text)) return true;
  if (/here(?:'|’)s what was done:/i.test(text)) return true;
  if (/if you need(?: any)? further assistance/i.test(text)) return true;
  if (/if there's anything else(?: you'd like to do)?[, ]+just let me know/i.test(text)) return true;
  if (/let me know if you need(?: anything else| any further modifications)?/i.test(text)) return true;
  if (/what would you like to do next\?/i.test(text)) return true;
  if (/is there anything specific you'd like to do next\?/i.test(text)) return true;
  if (/is there anything specific you would like to change or add(?: to this draft)?\?/i.test(text)) return true;
  if (/is there anything specific you'd like to adjust or add(?: to this draft)?\?/i.test(text)) return true;
  if (/if you have any specific questions about [^.?!\n]+,? feel free to ask!?/i.test(text)) return true;
  if (/you can see more details in the booking service here\.?/i.test(text)) return true;
  if (/you can find it in your tasks section here\.?/i.test(text)) return true;
  if (/^it seems\s+if you want to know how to /i.test(text)) return true;
  if (/feel free to ask about any particular step\.?$/i.test(text)) return true;
  if (/it looks like i can['’]t find any specific steps or results/i.test(text)) return true;
  if (/it seems there wasn['’]t any action executed/i.test(text)) return true;
  if (/i didn['’]t find any action taken/i.test(text)) return true;
  if (/i didn['’]t take any actions,? so there are no results to share/i.test(text)) return true;
  if (/if you need assistance with anything else, just let me know!?/i.test(text)) return true;
  if (/if you need assistance with something else, just let me know!?/i.test(text)) return true;
  if (/if you['’]re looking for more information or need help with something else, just let me know!?/i.test(text)) return true;
  if (/if you need more details or specific actions regarding these members, just let me know!?/i.test(text)) return true;
  if (/if you have any other questions or need help with something else,? feel free to ask!?/i.test(text)) return true;
  if (/if you['’]re ready to proceed with [^.?!\n]*,? just let me know,? and i can assist you directly!?/i.test(text)) return true;
  if (/would you like to address this issue now\?/i.test(text)) return true;
  if (/would you like to review or publish the draft now\?/i.test(text)) return true;
  if (/would you like to review any specific sections or make additional changes\?/i.test(text)) return true;
  if (/would you like to review the error details(?: related to [^?]+)?\?/i.test(text)) return true;
  if (/would you like to review the details of the error\?/i.test(text)) return true;
  if (/would you like to make any changes to the draft\?/i.test(text)) return true;
  if (/would you like to do anything else\?/i.test(text)) return true;
  if (/would you like to proceed with any of these times\?/i.test(text)) return true;
  if (/would you like to proceed with any changes\?/i.test(text)) return true;
  if (/would you like to address this\?/i.test(text)) return true;
  if (/would you like to make any adjustments to the template\?/i.test(text)) return true;
  if (/what adjustments would you like to make\?/i.test(text)) return true;
  if (/is there a specific area you want to explore further(?:,? like [^?]+)?\?/i.test(text)) return true;
  if (/do you have any specific areas? in mind(?: that you want to focus on)?\?/i.test(text)) return true;
  if (/what specifically do you want to know about [^?]+\?/i.test(text)) return true;
  if (/what specific areas do you still find weak or incomplete/i.test(text)) return true;
  if (/could you please specify(?: that)?\??/i.test(text)) return true;
  if (/this work isn['’]t finished yet/i.test(text)) return true;
  if (/i need to know exactly which specific areas or records/i.test(text)) return true;
  if (/stopped that run\.\s*i paused before taking the next step/i.test(text)) return true;
  if (/^(?:i successfully|i was able to)\s+(?:retrieve|retrieved|list|listed|find|found|gather|gathered)\b/i.test(text)) return true;
  if (/you mentioned booking setup.*(?:is there anything specific|what specifically)/i.test(text)) return true;
  if (/\bno action was taken\b/i.test(text)) return true;
  if (/\bit looks like no action was taken\b/i.test(text)) return true;
  if (/\bi couldn['’]t execute any steps\b/i.test(text)) return true;
  if (/\bi can['’]t provide specific results\b/i.test(text)) return true;
  if (/\bif you need specific guidance on how to do this, let me know!?/i.test(text)) return true;
  if (/\bif you want me to create [^.?!\n]* just let me know!?/i.test(text)) return true;
  if (/\bif you want to make any changes or need more details, just let me know!?/i.test(text)) return true;
  if (/you (?:didn't|did not) mention anything about the booking setup/i.test(text)) return true;
  if (/is that area ready as well\?/i.test(text)) return true;
  if (/if you (?:want|have) .*?(?:adjustments|changes?)(?: in mind)?[, ]+just let me know!?/i.test(text)) return true;
  if (/if you have .*?(?:further instructions)(?: in mind)?[, ]+just let me know!?/i.test(text)) return true;
  if (/if you'd like to review the updated availability, you can check it /i.test(text)) return true;
  if (/if you'd like to check (?:it|them) out, here's the link:?/i.test(text)) return true;
  if (/if you'd like to check the newsletter settings, you can view them /i.test(text)) return true;
  if (/if you'd like to take a look, check it out /i.test(text)) return true;
  if (/if you're looking for more information, you can check out /i.test(text)) return true;
  if (/if you want to check(?: out)? /i.test(text)) return true;
  if (/if you want to explore /i.test(text)) return true;
  if (/if you need to check the details or make adjustments, you can do so /i.test(text)) return true;
  if (/if you need to review it or make further adjustments, just let me know!?/i.test(text)) return true;
  if (/if you have any specific preferences or need further assistance, just let me know!?/i.test(text)) return true;
  if (/if you have any more questions, just let me know!?/i.test(text)) return true;
  if (/if you have any questions, feel free to ask!?/i.test(text)) return true;
  if (/if you need more information, feel free to ask!?/i.test(text)) return true;
  if (/if you need to download or share the image, just let me know!?/i.test(text)) return true;
  if (/if you need anything else, feel free to ask!?/i.test(text)) return true;
  if (/if you have any further adjustments or questions about this setup, feel free to ask!?/i.test(text)) return true;
  if (/if you have any specific aspects you want to explore further, feel free to ask!?/i.test(text)) return true;
  if (/if there['’]s a specific area you['’]d like to explore further, just let me know!?/i.test(text)) return true;
  if (/if you have specific concerns about (?:any )?(?:components|areas|parts)[^.?!\n]*feel free to (?:ask|share)!?/i.test(text)) return true;
  if (/however,? i didn['’]t find any details regarding the booking setup\.?/i.test(text)) return true;
  if (/if there'?s anything else.*just let me know!?/i.test(text)) return true;
  if (/you can check the details or try again here\.?/i.test(text)) return true;
  if (/if you need more information or want to explore further/i.test(text)) return true;
  if (/for more details(?: or to take further action)?\.?$/i.test(text)) return true;
  if (/for more information(?: on [^.?!\n]+)?\.?$/i.test(text)) return true;
  if (/for additional details\.?$/i.test(text)) return true;
  if (/to dive deeper into [^.?!\n]+\.?$/i.test(text)) return true;
  if (/you can find more details in the [^.?!\n]+(?:settings|section|service)\.?/i.test(text)) return true;
  if (/you can check or adjust your settings in the [^.?!\n]+settings\.?/i.test(text)) return true;
  if (/you can see more details in the [^.?!\n]+settings\.?/i.test(text)) return true;
  if (/you can see more details in the [^.?!\n]+section\.?/i.test(text)) return true;
  if (/you can manage it further in the [^.?!\n]+settings\.?/i.test(text)) return true;
  if (/you can find the settings in the portal here\.?/i.test(text)) return true;
  if (/you can (?:check|see|view|manage|find) [^.?!\n]{0,180} in the [^.?!\n]+settings\.?/i.test(text)) return true;
  if (/for more insights,? you can (?:check|see|view|find) [^.?!\n]{0,180}(?:section|page|portal)\.?/i.test(text)) return true;
  if (/you can explore (?:it|this|them) further in the portal\.?/i.test(text)) return true;
  if (/if you'?re looking for more details or need help with anything specific,? just let me know!?/i.test(text)) return true;
  if (/you can see (?:it|them|this) in your dashboard\.?/i.test(text)) return true;
  if (/if you need to update that, you can do so in the billing section\.?/i.test(text)) return true;
  if (/what would you like to check regarding your sales reporting integration settings\??/i.test(text)) return true;
  if (/if you want to see more details, you can visit the contacts section\.?/i.test(text)) return true;
  if (/you can see the full list of users here\.?/i.test(text)) return true;
  if (/you can explore these options in the settings\.?/i.test(text)) return true;
  if (/you can find more details about your settings here\.?/i.test(text)) return true;
  if (/you can find more information in the setup section\.?/i.test(text)) return true;
  if (/you can find more information in the newsletter services section\.?/i.test(text)) return true;
  if (/you can find more information in the [^.?!\n]+ services section\.?/i.test(text)) return true;
  if (/you can access more information through the [^.?!\n]+ services section\.?/i.test(text)) return true;
  if (/you can access it here\.?/i.test(text)) return true;
  if (/you can check more details in the funnel builder\.?/i.test(text)) return true;
  if (/you can find more about it in the funnel builder section\.?/i.test(text)) return true;
  if (/you can see more details in the funnel builder service\.?/i.test(text)) return true;
  if (/if you need to check for updates or any other details, you can look at the [^.?!\n]+ section\.?/i.test(text)) return true;
  if (/if you need to dive deeper, you can check (?:it|them|this) in your [^.?!\n]+ section\.?/i.test(text)) return true;
  if (/to explore more about these campaigns\.?$/i.test(text)) return true;
  if (/for more insights\.?$/i.test(text)) return true;
  if (/for further management\.?$/i.test(text)) return true;
  if (/you can (?:view|check) the details here\.?/i.test(text)) return true;
  if (/you can check or manage this further here\.?/i.test(text)) return true;
  if (/you can check them out in the media library\.?/i.test(text)) return true;
  if (/you can check out the details in the media library here\.?/i.test(text)) return true;
  if (/you can view it in the media library here\.?/i.test(text)) return true;
  if (/you can check it out in the media library here\.?/i.test(text)) return true;
  if (/you can explore more in the media library\.?/i.test(text)) return true;
  if (/for a complete view of your tasks, you can check the tasks section\.?/i.test(text)) return true;
  if (/you can view it in your nurture campaigns here\.?/i.test(text)) return true;
  if (/you can check the updated details here\.?/i.test(text)) return true;
  if (/you can review the updated settings here\.?/i.test(text)) return true;
  if (/you can view the updated availability here\.?/i.test(text)) return true;
  if (/you can take a look at the newsletter service for more details\.?/i.test(text)) return true;
  if (/if you['’]re looking for specific information, you might want to check the \[[^\]]+\]\([^\)]+\) for updates\.?/i.test(text)) return true;
  if (/if you want to see more about the media items or specific folders, just let me know!?/i.test(text)) return true;
  if (/you can check out more details in the lead scraping section of the portal here\.?/i.test(text)) return true;
  if (/you can check out more about the lead scraping process here\.?/i.test(text)) return true;
  if (/you can check the booking service\.?/i.test(text)) return true;
  if (/you can explore them further in the media library\.?/i.test(text)) return true;
  if (/you can check the funnel here(?: for more details)?\.?/i.test(text)) return true;
  if (/you can view and edit it here\.?/i.test(text)) return true;
  if (/you can edit the page here\.?/i.test(text)) return true;
  if (/you can check them here\.?/i.test(text)) return true;
  if (/you can view more details here\.?/i.test(text)) return true;
  if (/you can head over to the newsletter services page\.?/i.test(text)) return true;
  if (/you can check it out in your media library here\.?/i.test(text)) return true;
  if (/you can check it out in the nurture campaigns section(?: here)?\.?/i.test(text)) return true;
  if (/you can view the updated campaign here\.?/i.test(text)) return true;
  if (/you can find it in the nurture campaigns section\.?/i.test(text)) return true;
  if (/you can view it in the nurture campaigns section\.?/i.test(text)) return true;
  if (/you can view the updated campaign details in the nurture campaigns section\.?/i.test(text)) return true;
  if (/you can find the updated details in the nurture campaigns section\.?/i.test(text)) return true;
  if (/you can see it here\.?/i.test(text)) return true;
  if (/you can check the reviews section\.?/i.test(text)) return true;
  if (/you can see it in the reviews section\.?/i.test(text)) return true;
  if (/you can check out the lead scraping service\.?/i.test(text)) return true;
  if (/you can check it out in the lead scraping section here\.?/i.test(text)) return true;
  if (/you can view the lead scraping details in the portal at the lead scraping service\.?/i.test(text)) return true;
  if (/you can visit the booking settings\.?/i.test(text)) return true;
  if (/you can check them out in the booking section of the portal here\.?/i.test(text)) return true;
  if (/you can check the updated settings in the booking form settings\.?/i.test(text)) return true;
  if (/you can view and edit this page here\.?/i.test(text)) return true;
  if (/you can view and edit the layout here\.?/i.test(text)) return true;
  if (/you can check on the review or make any further adjustments[^.?!\n]*\.?/i.test(text)) return true;
  if (/if you have specific areas you want to dive deeper into,? just let me know!?/i.test(text)) return true;
  if (/if you need\s*,\s*you can visit [^.?!\n]*\.?/i.test(text)) return true;
  if (/you can check the updated settings in the booking settings\.?/i.test(text)) return true;
  if (/you can check the details in the newsletter service\.?/i.test(text)) return true;
  if (/or audience for sending, you can check those in the newsletter service here\.?/i.test(text)) return true;
  if (/if you need an audience for this newsletter, you can check the newsletter service\.?/i.test(text)) return true;
  if (/you can explore it in the blog section here\.?/i.test(text)) return true;
  if (/you can manage it further in the blog section\.?/i.test(text)) return true;
  if (/you can view the changes in the booking settings\.?/i.test(text)) return true;
  if (/if you want to see the changes, you can check the settings here\.?/i.test(text)) return true;
  if (/you can continue working on it here\.?/i.test(text)) return true;
  if (/you can check the draft here\.?/i.test(text)) return true;
  if (/you can view and edit the page here\.?/i.test(text)) return true;
  if (/you can view the details in the nurture campaigns section\.?/i.test(text)) return true;
  if (/you can see the updates in the nurture campaigns section here\.?/i.test(text)) return true;
  if (/you can view the details in the media library\.?/i.test(text)) return true;
  if (/you can explore the media items further in the media library\.?/i.test(text)) return true;
  if (/you can take further actions or download it from the media library at the media library\.?/i.test(text)) return true;
  if (/you can view the updated availability details here\.?/i.test(text)) return true;
  if (/you can check the updated availability details here\.?/i.test(text)) return true;
  if (/you can explore these further in the booking service\.?/i.test(text)) return true;
  if (/if you need to check for new reviews later, you can visit the reviews section\.?/i.test(text)) return true;
  if (/you can view the details in the reviews section\.?/i.test(text)) return true;
  if (/you can view it in the reviews section\.?/i.test(text)) return true;
  if (/you can reserve your spot today!?\s*to see the details\.?/i.test(text)) return true;
  if (/you might want to check the (?:audience|recipient) settings[^.?!\n]*\.?/i.test(text)) return true;
  if (/if you need to manage the audience or any settings, you can check the newsletter service\.?/i.test(text)) return true;
  if (/if you want to adjust the audience or resubmit, let me know\.?/i.test(text)) return true;
  if (/you can edit it before publishing\.?/i.test(text)) return true;
  if (/the document is still in draft status, so you can review it and make any further adjustments before publishing\.?/i.test(text)) return true;
  if (/it(?: is|'s) currently in draft mode, so (?:it would be wise to )?review it before finalizing\.?/i.test(text)) return true;
  if (/currently,? the document is saved as a draft, allowing you to review it before making it live\.?/i.test(text)) return true;
  if (/if you need to look for more details, you can check the reviews section\.?/i.test(text)) return true;
  if (/if you need more information, just ask!?/i.test(text)) return true;
  if (/for more information\s*$/i.test(text)) return true;
  if (/to see the changes\.?$/i.test(text)) return true;
  if (/to see the details\.?$/i.test(text)) return true;
  if (/\band the [^.?!\n]+ settings here\.?$/i.test(text)) return true;
  if (/\band the [^.?!\n]+ details here\.?$/i.test(text)) return true;
  if (/\bcurrently,?\s+the [^.?!\n]+ settings can be reviewed here\.?$/i.test(text)) return true;
  if (/\bthe current [^.?!\n]+ settings have also been retrieved\.?/i.test(text)) return true;
  if (/\bthe current [^.?!\n]+ settings have been retrieved\.?/i.test(text)) return true;
  if (/\bthe current [^.?!\n]+ settings were retrieved successfully\.?/i.test(text)) return true;
  if (/\b(?:additionally,?\s*)?i retrieved the current [^.?!\n]+ settings\.?/i.test(text)) return true;
  if (/\bi also retrieved the current [^.?!\n]+ settings\.?/i.test(text)) return true;
  if (/\band check the [^.?!\n]+ settings\s*(?:\[[^\]]+\]\([^\)]+\)|here)\.?/i.test(text)) return true;
  if (/\bif you need to check the updated [^.?!\n]+, you can do so here\.?/i.test(text)) return true;
  if (/\bthe current [^.?!\n]+ settings are now available for you to review(?: at the \[[^\]]+\]\([^\)]+\))?\.?/i.test(text)) return true;
  if (/\bthe current [^.?!\n]+ settings can be viewed\s*\[[^\]]+\]\([^\)]+\)\.?/i.test(text)) return true;
  if (/\bthe [^.?!\n]+ settings are accessible\s*\[[^\]]+\]\([^\)]+\)\.?/i.test(text)) return true;
  if (/\byou can see the updated settings in the [^.?!\n]+ section\.?/i.test(text)) return true;
  if (/\bif you need to check the settings further\b/i.test(text)) return true;
  if (/\bor check the \[[^\]]+\]\([^\)]+\)\.?/i.test(text)) return true;
  if (/\byou can review the booking settings here\b/i.test(text)) return true;
  if (/\byou can find more details about the booking settings here\b/i.test(text)) return true;
  if (/\byou can find more information about the ai receptionist here\b/i.test(text)) return true;
  if (/\bcurrently,?\s+to check out the booking settings, you can do so here,? and for the ai receptionist settings, click here\.?/i.test(text)) return true;
  if (/\bthe current booking settings are as follows:\s*/i.test(text)) return true;
  if (/\byour current booking settings are as follows:\s*/i.test(text)) return true;
  if (/\bfor the ai receptionist, it is currently [^.?!\n]+(?:,?\s*with the greeting mentioned above)?\.?/i.test(text)) return true;
  if (/\bthe current settings show that the ai receptionist is [^.?!\n]+\.?/i.test(text)) return true;
  if (/\bthe ai receptionist is currently [^.?!\n]+\.\s*(?:the current greeting is|the greeting is):\s*"([^"]+)"\.?\s*the ai receptionist is currently [^.?!\n]+\.\s*current greeting:\s*"\1"\.?/i.test(text)) return true;
  if (/\bthe greeting now reads:\s*"([^"]+)"\.?\s*the ai receptionist is currently [^.?!\n]+\.\s*current greeting:\s*"\1"\.?/i.test(text)) return true;
  if (/\bthe greeting is:\s*"([^"]+)"\.?\s*the ai receptionist is currently [^.?!\n]+\.\s*current greeting:\s*"\1"\.?/i.test(text)) return true;
  if (/to review it further\.?$/i.test(text)) return true;
  if (/for you to make any adjustments\.?/i.test(text)) return true;
  if (/to review it or make further adjustments, just let me know!?/i.test(text)) return true;
  if (/if you have any specific areas you want to explore further, just let me know!?/i.test(text)) return true;
  if (/it['’]s saved as a draft, so\s*$/i.test(text)) return true;
  if (/it['’]s currently in draft(?: form| status)? and hasn['’]t been published yet\.?/i.test(text)) return true;
  if (/\bi analyzed the (?:dashboard|portal|account|system) and found it (?:operational|organized|accessible)\b/i.test(text)) return true;
  if (/\b(?:everything|it) (?:looks|seems) (?:operational|accessible|organized|healthy|solid)\b/i.test(text)) return true;
  if (/\b(?:the|your) (?:dashboard|portal|account|setup|system) (?:is|looks|seems) running smoothly\b/i.test(text)) return true;
  if (/\bthis will give you insights into recent performance\b/i.test(text)) return true;
  if (/\bi (?:analyzed|reviewed) the (?:dashboard|portal|account|system)\b/i.test(text) && !/\b(?:missing|blocked|stale|outdated|open|pending|failed|warning|warnings|issue|issues|priority|priorities|gap|gaps|risk|risks|healthy|unhealthy|inactive|active|draft|published|error|errors)\b/i.test(text)) return true;
  if (/if you need an audience[^.?!\n]*newsletter service[^.?!\n]*\.?/i.test(text)) return true;
  if (/if you need to adjust the audience or request messages, let me know!?/i.test(text)) return true;
  if (/you might want to check[^.?!\n]*(?:newsletter service|reviews section|booking availability section|lead scraping section|lead scraping service)[^.?!\n]*\.?/i.test(text)) return true;
  if (/you can (?:view|check|edit|manage|explore)(?: [^.?!\n]+){0,10} (?:here|in the [^.?!\n]+ section|in the [^.?!\n]+ service)\.?/i.test(text)) return true;
  if (/to edit the page, you can do so here\.?/i.test(text)) return true;
  if (/you can make any additional changes you['’]d like\.?/i.test(text)) return true;
  if (/it['’]s ready for you to edit or add content before publishing\.?/i.test(text)) return true;
  if (/you can make changes in the blog section\.?/i.test(text)) return true;
  if (/this update is complete, so you can review it anytime before it goes live\.?/i.test(text)) return true;
  if (/you['’]ll need to review it before it goes live\.?/i.test(text)) return true;
  if (/you can check the generated html for it now\.?/i.test(text)) return true;
  if (/you['’]re ready to start capturing leads!?/i.test(text)) return true;
  if (/you can continue editing the page here\.?/i.test(text)) return true;
  if (/you can now manage your media files there\.?/i.test(text)) return true;
  if (/you can find it in the media library\.?/i.test(text)) return true;
  if (/if you want to manage it further, you can head over to the media library here\.?/i.test(text)) return true;
  if (/you can also edit the funnel here\.?/i.test(text)) return true;
  if (/you can see the details and make any edits through this link\.?/i.test(text)) return true;
  if (/you can find the updated settings here\.?/i.test(text)) return true;
  if (/if you['’]re looking for something specific or need assistance with another task, just let me know!?/i.test(text)) return true;
  if (/since there are currently no reviews, there(?:'s| is) nothing to display\.?/i.test(text)) return true;
  if (/you can see the update in your nurture campaigns section here\.?/i.test(text)) return true;
  if (/you can check it out in the media library\.?/i.test(text)) return true;
  if (/you can access the media library here\.?/i.test(text)) return true;
  if (/you can find more information in the reviews section\.?/i.test(text)) return true;
  if (/you can check more details in your reviews section\.?/i.test(text)) return true;
  if (/you can adjust your settings to send it to an audience\.?/i.test(text)) return true;
  if (/this document is still in draft status\.?/i.test(text)) return true;
  if (/it['’]s currently saved as a draft for your review before going live\.?/i.test(text)) return true;
  if (/it appears the demo account is much closer to being production-ready based on the sampled surfaces\.?/i.test(text)) return true;
  if (/everything checked out for the demo readiness assessment\.?/i.test(text)) return true;
  if (/you can see the updated form in the booking settings\.?/i.test(text)) return true;
  if (/you can explore the reviews section for more details\.?/i.test(text)) return true;
  if (/you can \[(?:open|download|share)\]\([^\)]+\)(?:,?\s*\[(?:open|download|share)\]\([^\)]+\)){1,}\s*(?:it now)?\.?/i.test(text)) return true;
  if (/the document is currently saved as a draft\.?/i.test(text)) return true;
  if (/it['’]s currently in draft status\.?/i.test(text)) return true;
  if (/if you['’]re ready to make it live or need any adjustments, just let me know!?/i.test(text)) return true;
  if (/you can find more details in the nurture campaigns section\.?/i.test(text)) return true;
  if (/you can find it in the lead scraping service here\.?/i.test(text)) return true;
  if (/this looks much closer to production-ready across the sampled surfaces\.?/i.test(text)) return true;
  if (/for any updates\.?$/i.test(text)) return true;
  if (/for any further actions you want to take\.?$/i.test(text)) return true;
  if (/if needed\.?$/i.test(text)) return true;
  if (/to view the updated draft\.?$/i.test(text)) return true;
  if (/of the portal here\.?$/i.test(text)) return true;
  if (/it now reads:\s*$/i.test(text)) return true;
  if (/the subject reads\s*/i.test(text) && /(funnel audit|webinar|draft|template)/i.test(text)) return true;
  if (/\.\s{2,}(?:section|service|settings|here|there)\.?$/i.test(text)) return true;
  if (/still in draft (?:status|form)[^.\n]*(?:before going live|before publishing|hasn['’]t been published)/i.test(text)) return true;
  if (/to review your booking settings\b/i.test(text)) return true;
  if (/to book one of these slots\b/i.test(text)) return true;
  if (/to check out the review or manage responses\b/i.test(text)) return true;
  if (/to explore more about your reviews\b/i.test(text)) return true;
  if (/to make any further adjustments\b/i.test(text)) return true;
  if (/to see more about the reviews\b/i.test(text)) return true;
  if (/to review or use the template\b/i.test(text)) return true;
  if (/to check it out\b/i.test(text)) return true;
  if (/to review the settings\b/i.test(text)) return true;
  if (/to proceed with any of these slots\b/i.test(text)) return true;
  if (/to explore more options or book a slot, check out the booking service\b/i.test(text)) return true;
  if (/to explore these options further\b/i.test(text)) return true;
  if (/to see it in context, you can view the details in your nurture campaigns\b/i.test(text)) return true;
  if (/to explore that further\b/i.test(text)) return true;
  if (/if you['’]re looking for more information, you can check the reviews section\.?/i.test(text)) return true;
  if (/if you have specific concerns about [^.?!\n]+please let me know!?/i.test(text)) return true;
  if (/you can check it out and make any adjustments you need [^.?!\n]*here\.?/i.test(text)) return true;
  if (/\bin draft status\b/i.test(text) && /(review|adjustments|publish|edit)/i.test(text)) return true;
  if (/you can [^.\n]{0,220}\[[^\]]+\]\([^\)]+\)\.?/i.test(text)) return true;
  if (/for more details[^.\n]{0,220}\[[^\]]+\]\([^\)]+\)\.?/i.test(text)) return true;
  if (/^\[[^\]]+\]\(https?:\/\/[^)]+\)$/im.test(text)) return true;
  if (/(?:you can|check out|view it|manage it|review your settings|check them here:?|for more details|for more insights).{0,260}(?<!\()https?:\/\//i.test(text)) return true;
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(text)) return true;
  if (/could you clarify what you mean by [^?]+\?/i.test(text)) return true;
  if (/\swith(?: the)? ID\s+"?[a-z0-9-]{12,80}"?\b/i.test(text)) return true;
  if (/under the funnel ID\s+"?[a-z0-9-]{12,80}"?/i.test(text)) return true;
  if (/`?[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\(\)`?/i.test(text)) return true;
  if (/went through(?: without any issues)?/i.test(text)) return true;
  if (/successfully dispatched/i.test(text)) return true;
  if (/(?<!\()https?:\/\/\S+/i.test(text)) return true;
  if (/https?:\/\/(?:yourdomain\.com|your-portal-url|yourportal\.com)/i.test(text)) return true;
  if (/[^\n;]{12,};\s+[^\n;]{12,};\s+[^\n;]{12,}/i.test(text)) return true;
  if (/(?:\s|\n)(?:if you|you can)\b[^.!?\n]{0,220}$/i.test(text)) return true;
  if (/^\s*\d+\.\s+/m.test(text)) return true;
  if (/\bwhich\s*$/i.test(text)) return true;
  if (/\b(?:and|for further details|for more information|so)\s*$/i.test(text)) return true;
  if (!allowBullets && /^#{1,6}\s+/m.test(text)) return true;

  const bulletCount = text.split("\n").filter((line) => BULLET_RE.test(line)).length;
  if (!allowBullets && bulletCount >= 3) return true;

  return false;
}
