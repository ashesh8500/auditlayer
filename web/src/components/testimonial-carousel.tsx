"use client";

import { useRef } from "react";
import { ArrowRight } from "lucide-react";

const TESTIMONIALS = [
  {
    quote:
      "The information you provided is incredibly insightful and offers actionable steps that align with our direction. We fully agree with your recommendation to showcase products in real lived-in spaces that are attainable because we believe that curation exists at every level. Your analysis confirms that we are making the right decisions with this pivot, and we cannot thank you enough.",
    name: "Kas di Kos Team",
  },
];

export function TestimonialCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    trackRef.current?.scrollBy({
      left: dir === "left" ? -400 : 400,
      behavior: "smooth",
    });
  };

  return (
    <>
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="alm-kicker">Audit feedback</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">
            Loved by our community.
          </h2>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button
            type="button"
            aria-label="Scroll testimonials left"
            onClick={() => scroll("left")}
            className="alm-focus grid size-10 place-items-center border border-border bg-card text-foreground hover:bg-muted"
          >
            <ArrowRight className="size-4 rotate-180" />
          </button>
          <button
            type="button"
            aria-label="Scroll testimonials right"
            onClick={() => scroll("right")}
            className="alm-focus grid size-10 place-items-center border border-border bg-card text-foreground hover:bg-muted"
          >
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TESTIMONIALS.map((t) => (
          <figure
            key={t.name}
            className="min-w-[300px] max-w-[420px] shrink-0 snap-start border border-border bg-card p-6 sm:p-7"
          >
            <blockquote className="text-sm leading-6 text-foreground/80 sm:text-base sm:leading-7">
              &ldquo;{t.quote}&rdquo;
            </blockquote>
            <figcaption className="mt-6 flex items-center gap-3 border-t border-border pt-4">
              <cite className="block text-sm font-semibold not-italic">{t.name}</cite>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
