type PuraReplyQualityOptions = {
  allowBullets?: boolean;
  maxLength?: number;
};

const CANNED_CLOSER_RE =
  /(?:^|\n)\s*(?:if you need(?: any)? further assistance.*|if there's anything else(?: you'd like to do)?[, ]+just let me know.*|let me know if you need(?: anything else| any further modifications)?.*|for more details(?: or to take further action)?,? you can .*|for more information on .*|you can continue editing or publish it later\.?|you can view and manage .* here\.?|you can manage .* here\.?|if you want to review or adjust any other settings, you can check them here\.?|if you need to look for more details, you can check the reviews section\.?|you can check out more about the lead scraping process here\.?|\[[^\]]+\]\(https?:\/\/[^)]+\))\s*(?=\n|$)/gim;
const GENERIC_FOLLOWUP_RE =
  /(?:\s|^)(?:what would you like to do next\?|would you like to do anything else\?|is there anything specific you'd like to do next\?|is there anything specific you would like to change or add(?: to this draft)?\?|is there anything specific you'd like to adjust or add(?: to this draft)?\?|would you like to address this issue now\?|would you like to address this\?|would you like to review or publish the draft now\?|would you like to review any specific sections or make additional changes\?|would you like to review the error details(?: related to [^?]+)?\?|would you like to review the details of the error\?|would you like to make any changes to the draft\?|would you like to proceed with any of these times\?|would you like to proceed with any changes\?|would you like to make any adjustments to the template\?|would you like to explore that further\?|what adjustments would you like to make\?|is there a specific area you want to explore further(?:,? like [^?]+)?\?|do you have any specific areas? in mind(?: that you want to focus on)?\?|what specifically do you want to know about [^?]+\?|is that area ready as well\?|if you need .*?just let me know!?|if you (?:want|have) .*?(?:adjustments|changes?|further instructions)(?: in mind)?[, ]+just let me know!?|if you'd like\.?|if you'd like a summary of the changes made, just ask!?|if you'd like to review the campaign details, you can check it out .*|if you'd like to review the updated availability, you can check it .*|if you'd like to check (?:it|them) out, here's the link:?|if you'd like to check the newsletter settings, you can view them .*|if you'd like to take a look, check it out .*|if you're looking for more information, you can check out .*|if you want to check(?: out)? .*|if you want to explore .*|if you want to check it out or make any adjustments, you can visit .*|if you need to adjust anything or want to clarify .*?just let me know!?|if you need to check the details or make adjustments, you can do so .*|if you need to review it or make further adjustments, just let me know!?|if you have any specific preferences or need further assistance, just let me know!?|if you have any more questions, just let me know!?|if you have any questions, feel free to ask!?|if you need more information, feel free to ask!?|if you need to download or share the image, just let me know!?|if you need anything else, feel free to ask!?|if you have any further adjustments or questions about this setup, feel free to ask!?|if you have any specific aspects you want to explore further, feel free to ask!?|if you have specific concerns about (?:any )?(?:components|areas|parts)[^.?!\n]*feel free to (?:ask|share)!?|if there'?s anything else.*just let me know!?|you can (?:check (?:it|them) out here|view it here|review the details here|check more details in the booking service|check or manage this further here)\.?|you can [^.\n]{0,220}\[[^\]]+\]\([^\)]+\)\.?|for more details[^.\n]{0,220}\[[^\]]+\]\([^\)]+\)\.?|could you clarify what you mean by [^?]+\?)(?=\s|$)/gim;

const PLACEHOLDER_LINK_RE = /\[([^\]]+)\]\((https?:\/\/(?:yourdomain\.com|your-portal-url|yourportal\.com)[^)]+)\)/gi;
const PLACEHOLDER_URL_RE = /https?:\/\/(?:yourdomain\.com|your-portal-url|yourportal\.com|yourappurl\.com)[^\s)]*/gi;
const INTERNAL_ID_RE = /\s+(?:with|under)(?: the)?\s+(?:ID|slug)\s+[*`"]{0,2}[a-z0-9-]{8,120}[*`"]{0,2}\b/gi;
const INTERNAL_CODE_RE = /`?[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\(\)`?/gi;
const BARE_UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const HEADING_RE = /^#{1,6}\s+/;
const BULLET_RE = /^\s*[-*]\s+/;

export function cleanPuraGeneratedReply(raw: string, opts: PuraReplyQualityOptions = {}): string {
  const allowBullets = Boolean(opts.allowBullets);
  const maxLength = Number.isFinite(opts.maxLength) ? Math.max(200, Math.floor(opts.maxLength as number)) : 12_000;

  const lines = String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
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

  const normalized = lines
    .join("\n")
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
    .replace(/\byou can check the details in the newsletter service\.?/gi, "")
    .replace(/\bor audience for sending, you can check those in the newsletter service here\.?/gi, "")
    .replace(/\bif you need an audience for this newsletter, you can check the newsletter service\.?/gi, "")
    .replace(/\byou can explore it in the blog section here\.?/gi, "")
    .replace(/\byou can manage it further in the blog section\.?/gi, "")
    .replace(/\byou can view the changes in the booking settings\.?/gi, "")
    .replace(/\bif you want to see the changes, you can check the settings here\.?/gi, "")
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
    .replace(/\bfor more information\s*$/i, "")
    .replace(/\bto see the changes\.?$/i, "")
    .replace(/\bto see the details\.?$/i, "")
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
    .replace(/\bsince there are currently no reviews, there(?:'s| is) nothing to display\.?/gi, "")
    .replace(/\byou can see the update in your nurture campaigns section here\.?/gi, "")
    .replace(/\byou can check it out in the media library\.?/gi, "")
    .replace(/\byou can access the media library here\.?/gi, "")
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
    .replace(/\bthe document is currently saved as a draft\.?/gi, "")
    .replace(/\bit['’]s currently in draft status\.?/gi, "")
    .replace(/\bif you['’]re ready to make it live or need any adjustments, just let me know!?/gi, "")
    .replace(/\byou can find more details in the nurture campaigns section\.?/gi, "")
    .replace(/\byou can find it in the lead scraping service here\.?/gi, "")
    .replace(/\bthis looks much closer to production-ready across the sampled surfaces\.?/gi, "")
    .replace(/\bfor any updates\.?$/i, "")
    .replace(/\bfor any further actions you want to take\.?$/i, "")
    .replace(/\bif needed\.?$/i, "")
    .replace(/\bto view the updated draft\.?$/i, "")
    .replace(/\bof the portal here\.?$/i, "")
    .replace(/\bit now reads:\s*$/i, "")
    .replace(/\bthe subject reads\s*/gi, "")
    .replace(/\.\s{2,}(?:section|service|settings|here|there)\.?$/i, ".")
    .replace(/\bwhich\s*$/i, "")
    .replace(/\b(?:and|for further details|so)\s*$/i, "")
    .replace(/[,;:\-]\s*$/g, "")
    .trim();

  return normalized.slice(0, maxLength).trim();
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
  if (/if you need(?: any)? further assistance/i.test(text)) return true;
  if (/if there's anything else(?: you'd like to do)?[, ]+just let me know/i.test(text)) return true;
  if (/let me know if you need(?: anything else| any further modifications)?/i.test(text)) return true;
  if (/what would you like to do next\?/i.test(text)) return true;
  if (/is there anything specific you'd like to do next\?/i.test(text)) return true;
  if (/is there anything specific you would like to change or add(?: to this draft)?\?/i.test(text)) return true;
  if (/is there anything specific you'd like to adjust or add(?: to this draft)?\?/i.test(text)) return true;
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
  if (/you mentioned booking setup.*(?:is there anything specific|what specifically)/i.test(text)) return true;
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
  if (/you can (?:view|check) the details here\.?/i.test(text)) return true;
  if (/you can check or manage this further here\.?/i.test(text)) return true;
  if (/you can check them out in the media library\.?/i.test(text)) return true;
  if (/you can check out the details in the media library here\.?/i.test(text)) return true;
  if (/you can view it in the media library here\.?/i.test(text)) return true;
  if (/you can check it out in the media library here\.?/i.test(text)) return true;
  if (/you can view it in your nurture campaigns here\.?/i.test(text)) return true;
  if (/you can check the updated details here\.?/i.test(text)) return true;
  if (/you can review the updated settings here\.?/i.test(text)) return true;
  if (/you can view the updated availability here\.?/i.test(text)) return true;
  if (/you can take a look at the newsletter service for more details\.?/i.test(text)) return true;
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
  if (/to review it further\.?$/i.test(text)) return true;
  if (/for you to make any adjustments\.?/i.test(text)) return true;
  if (/to review it or make further adjustments, just let me know!?/i.test(text)) return true;
  if (/if you have any specific areas you want to explore further, just let me know!?/i.test(text)) return true;
  if (/it['’]s saved as a draft, so\s*$/i.test(text)) return true;
  if (/it['’]s currently in draft(?: form| status)? and hasn['’]t been published yet\.?/i.test(text)) return true;
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
  if (/(?:\s|\n)(?:if you|you can)\b[^.!?\n]{0,220}$/i.test(text)) return true;
  if (/^\s*\d+\.\s+/m.test(text)) return true;
  if (/\bwhich\s*$/i.test(text)) return true;
  if (/\b(?:and|for further details|for more information|so)\s*$/i.test(text)) return true;
  if (!allowBullets && /^#{1,6}\s+/m.test(text)) return true;

  const bulletCount = text.split("\n").filter((line) => BULLET_RE.test(line)).length;
  if (!allowBullets && bulletCount >= 3) return true;

  return false;
}
