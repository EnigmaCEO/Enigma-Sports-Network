import React from 'react';
import { getArticle } from '../../../lib/articles';
import Image from 'next/image';

type Props = {
	// params is a Promise in this Next version
	params: Promise<{ gameId?: string }>;
};

export default async function ArticlePage({ params }: Props) {
	const resolved = await params;
	const gameId = resolved?.gameId;

	if (!gameId) {
		return (
			<main className="mx-auto max-w-3xl p-6 space-y-4">
				<h1 className="text-xl font-semibold">Missing gameId</h1>
				<p>Could not determine the game id from the route. Ensure the URL is /articles/[gameId].</p>
			</main>
		);
	}

	const articleResp = await getArticle(gameId);

	if (!articleResp) {
		return (
			<main className="mx-auto max-w-3xl p-6 space-y-4">
				<h1 className="text-xl font-semibold">Article not available</h1>
				<p>
					No article could be loaded for game <span className="font-mono">{gameId}</span>. It may not have been
					generated yet or there was an error loading it.
				</p>
			</main>
		);
	}

	const { article } = articleResp;
	const published = article.publishedAt
		? new Date(article.publishedAt)
		: null;
	published?.toLocaleString();

	// derive highlight image URL
	const highlightImageUrl = `https://d2zq9pbfla02w4.cloudfront.net/${encodeURIComponent(
		gameId
	)}_highlight.png`;

	return (
		<main className="mx-auto max-w-3xl p-6 space-y-6">
			<header className="space-y-2">
				<p className="text-xs uppercase tracking-wide text-gray-500">ESN Recap</p>
				<h1 className="text-2xl font-bold leading-tight">{article.title}</h1>
				<p className="text-lg text-gray-700">{article.dek}</p>
				<div className="text-sm text-gray-500 space-x-2">
					<span>By {article.byline}</span>
					{/* published && !Number.isNaN(published.getTime()) && (
						<>
							<span>&middot;</span>
							<time dateTime={article.publishedAt}>
								{published.toLocaleString(undefined, {
									year: 'numeric',
									month: 'short',
									day: 'numeric',
									hour: '2-digit',
									minute: '2-digit',
								})}
							</time>
						</>
					) */}
				</div>
			</header>

			{/* article highlight image (50% size) */}
			<div className="rounded-md overflow-hidden flex justify-center">
				<Image
					src={highlightImageUrl}
					alt={`Highlight for game ${gameId}`}
					// half of the previous intrinsic size (1200x675 -> 600x337.5 ≈ 600x338)
					width={600}
					height={338}
					className="block"
					style={{
						width: '50%',   // render at half the container width
						height: 'auto',
						display: 'block',
					}}
				/>
			</div>

			<article className="space-y-4 leading-relaxed">
				{article.body?.map((para, idx) => (
					<p key={idx}>{para}</p>
				))}
			</article>

			{article.keyMoments?.length > 0 && (
				<section className="space-y-2">
					<h2 className="text-lg font-semibold">Key Moments</h2>
					<ul className="list-disc list-inside space-y-1">
						{article.keyMoments.map((moment, idx) => (
							<li key={idx}>{moment}</li>
						))}
					</ul>
				</section>
			)}

			{article.tags?.length > 0 && (
				<section className="space-y-2">
					<h2 className="text-sm font-semibold text-gray-600">Tags</h2>
					<div className="flex flex-wrap gap-2">
						{article.tags.map((tag, idx) => (
							<button
								key={idx}
								type="button"
								className="inline-flex items-center rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400"
                                style={{ margin: '5px' }}
							>
								{tag}
							</button>
						))}
					</div>
				</section>
			)}
		</main>
	);
}
