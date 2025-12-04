import React, { ReactNode } from "react";

type MaxWidth = "none" | "sm" | "md" | "lg" | "xl" | "2xl";

interface LayoutShellProps {
	children: ReactNode;
	/**
	 * Provide a custom header node. If omitted and showHeader is true, no header is rendered.
	 */
	header?: ReactNode;
	/**
	 * Provide a custom footer node. If omitted and showFooter is true, no footer is rendered.
	 */
	footer?: ReactNode;
	showHeader?: boolean;
	showFooter?: boolean;
	/**
	 * Wrap content in a centered container with a configurable max width.
	 */
	container?: boolean;
	maxWidth?: MaxWidth;
	/**
	 * Additional padding for the container. Accepts any valid CSS padding value or utility classes.
	 */
	padding?: string;
	/**
	 * Extra className added to the outermost wrapper for styling integration.
	 */
	className?: string;
}

/**
 * LayoutShell
 *
 * Minimal, framework-agnostic layout wrapper. Prefer passing custom header/footer nodes
 * so the component remains presentation-agnostic. It uses no external CSS assumptions;
 * consumers can pass className or rely on utility classes (e.g., Tailwind) if available.
 */
export default function LayoutShell({
	children,
	header,
	footer,
	showHeader = false,
	showFooter = false,
	container = true,
	maxWidth = "lg",
	padding = "1rem",
	className,
}: LayoutShellProps) {
	// map maxWidth to CSS maxWidth values — adjust to match your design system if needed
	const maxWidthMap: Record<MaxWidth, string> = {
		none: "none",
		sm: "36rem", // ~576px
		md: "48rem", // ~768px
		lg: "64rem", // ~1024px
		xl: "80rem", // ~1280px
		"2xl": "96rem", // ~1536px
	};

	const containerStyle: React.CSSProperties | undefined = container
		? {
				marginLeft: "auto",
				marginRight: "auto",
				maxWidth: maxWidthMap[maxWidth],
				padding,
		  }
		: undefined;

	return (
		<div className={className}>
			{showHeader && header && <header>{header}</header>}
			{/* If container is true, wrap children in centered container; otherwise render children directly */}
			{container ? <main style={containerStyle}>{children}</main> : <main>{children}</main>}
			{showFooter && footer && <footer>{footer}</footer>}
		</div>
	);
}
