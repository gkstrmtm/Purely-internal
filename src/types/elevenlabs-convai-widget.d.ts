type ElevenLabsConvaiElementProps = import("react").DetailedHTMLProps<
  import("react").HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  "agent-id"?: string;
};

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        "elevenlabs-convai": ElevenLabsConvaiElementProps;
      }
    }
  }
}

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "elevenlabs-convai": ElevenLabsConvaiElementProps;
    }
  }
}

declare module "react/jsx-dev-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "elevenlabs-convai": ElevenLabsConvaiElementProps;
    }
  }
}

export {};
