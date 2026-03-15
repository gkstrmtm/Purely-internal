import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Purely Connect",
};

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
	return children;
}
