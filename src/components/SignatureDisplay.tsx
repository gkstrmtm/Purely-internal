import { describeSignatureValue, readSignatureImageDataUrl, readSignatureText } from "@/lib/signature";

type Props = {
  value: unknown;
  emptyLabel?: string;
  className?: string;
  imageClassName?: string;
  textClassName?: string;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function SignatureDisplay({
  value,
  emptyLabel = "No signature stored yet",
  className,
  imageClassName,
  textClassName,
}: Props) {
  const imageDataUrl = readSignatureImageDataUrl(value);
  const textValue = readSignatureText(value);
  const summary = describeSignatureValue(value);

  if (imageDataUrl) {
    return (
      <div className={classNames("space-y-2", className)}>
        <img
          src={imageDataUrl}
          alt="Stored signature"
          className={classNames("max-h-24 w-auto max-w-full rounded-xl border border-zinc-200 bg-white p-2", imageClassName)}
        />
        {!textValue && summary ? <div className={classNames("text-xs text-zinc-500", textClassName)}>{summary}</div> : null}
      </div>
    );
  }

  if (textValue) {
    return <div className={classNames("whitespace-pre-wrap wrap-break-word text-sm text-zinc-800", className, textClassName)}>{textValue}</div>;
  }

  return <div className={classNames("text-sm text-zinc-500", className, textClassName)}>{emptyLabel}</div>;
}
