import React from "react";

type SizeToken = "sm" | "md" | "lg";

interface LoadingSpinnerProps extends React.SVGProps<SVGSVGElement> {
	/** number in px or token 'sm' | 'md' | 'lg' */
	size?: number | SizeToken;
	/** stroke width of the circular track */
	thickness?: number;
	/** stroke color (defaults to currentColor) */
	color?: string;
	/** rotation duration in seconds */
	speed?: number;
	/** Accessible title (if omitted and ariaLabel omitted, spinner is aria-hidden) */
	title?: string;
	/** aria-label override */
	ariaLabel?: string;
	className?: string;
}

const sizeMap: Record<SizeToken, number> = { sm: 20, md: 40, lg: 64 };

const LoadingSpinner = React.forwardRef<SVGSVGElement, LoadingSpinnerProps>(
	function LoadingSpinner(
		{
			size = "md",
			thickness = 3.6,
			color = "currentColor",
			speed = 0.9,
			title,
			ariaLabel,
			className,
			...rest
		},
		ref
	) {
		const resolvedSize = typeof size === "number" ? size : sizeMap[size];

		// If neither title nor ariaLabel provided, mark as decorative.
		const isDecorative = !title && !ariaLabel;

		const spinnerClass = "esn-loading-spinner"; // small unique class used by inline styles

		return (
			<>
				<style>{`
					@keyframes esn-spin { to { transform: rotate(360deg); } }
					.${spinnerClass} { display: inline-block; animation: esn-spin ${speed}s linear infinite; }
				`}</style>
				<svg
					{...rest}
					ref={ref}
					className={spinnerClass + (className ? ` ${className}` : "")}
					width={resolvedSize}
					height={resolvedSize}
					viewBox="0 0 50 50"
					fill="none"
					role={isDecorative ? undefined : "status"}
					aria-hidden={isDecorative ? true : undefined}
					aria-label={ariaLabel}
					xmlns="http://www.w3.org/2000/svg"
				>
					{title ? <title>{title}</title> : null}
					<circle
						cx="25"
						cy="25"
						r="20"
						stroke={color}
						strokeWidth={thickness}
						strokeLinecap="round"
						strokeDasharray="31.415, 31.415"
						strokeDashoffset="0"
						fill="none"
						opacity="0.15"
					/>
					<path
						d="M45 25a20 20 0 0 1-20 20"
						stroke={color}
						strokeWidth={thickness}
						strokeLinecap="round"
						fill="none"
					/>
				</svg>
			</>
		);
	}
);

export default React.memo(LoadingSpinner);
