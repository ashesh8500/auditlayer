"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

const TESTIMONIALS = [
  {
    quote:
      "Your analysis confirms that we are making the right decisions with this pivot, and we cannot thank you enough.",
    name: "Kas di Kos Team",
    label: "Client feedback · excerpt",
    placeholder: false,
  },
  {
    quote:
      "Sample copy for layout preview only. Replace this card with an approved client note about the clarity and usefulness of their report.",
    name: "Sample card 02",
    label: "Layout preview — not client feedback",
    placeholder: true,
  },
  {
    quote:
      "Sample copy for layout preview only. Replace this card with approved feedback about the diagnosis, peer comparison, or next steps.",
    name: "Sample card 03",
    label: "Layout preview — not client feedback",
    placeholder: true,
  },
  {
    quote:
      "Sample copy for layout preview only. Replace this card with an approved client note about what felt specific, useful, or actionable.",
    name: "Sample card 04",
    label: "Layout preview — not client feedback",
    placeholder: true,
  },
  {
    quote:
      "Sample copy for layout preview only. Replace this final card with real feedback before the carousel is presented as complete.",
    name: "Sample card 05",
    label: "Layout preview — not client feedback",
    placeholder: true,
  },
] as const;

const AUTOPLAY_MS = 4200;

export function TestimonialCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const moveTo = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    const track = trackRef.current;
    const item = track?.children.item(index) as HTMLElement | null;
    if (!track || !item) return;

    indexRef.current = index;
    setActiveIndex(index);
    track.scrollTo({ left: item.offsetLeft - track.offsetLeft, behavior });
  }, []);

  const move = useCallback((dir: "left" | "right") => {
    const delta = dir === "right" ? 1 : -1;
    const next = (indexRef.current + delta + TESTIMONIALS.length) % TESTIMONIALS.length;
    moveTo(next);
  }, [moveTo]);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (paused || reduceMotion.matches) return;

    const timer = window.setInterval(() => move("right"), AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [move, paused]);

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
            aria-label="Show previous testimonial"
            onClick={() => move("left")}
            className="alm-focus grid size-10 place-items-center border border-border bg-card text-foreground hover:bg-muted"
          >
            <ArrowRight className="size-4 rotate-180" />
          </button>
          <button
            type="button"
            aria-label="Show next testimonial"
            onClick={() => move("right")}
            className="alm-focus grid size-10 place-items-center border border-border bg-card text-foreground hover:bg-muted"
          >
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        aria-label="Community testimonials"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        className="mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TESTIMONIALS.map((testimonial) => (
          <figure
            key={testimonial.name}
            className={`min-w-[min(82vw,340px)] max-w-[420px] shrink-0 snap-start border p-5 sm:min-w-[380px] sm:p-6 ${
              testimonial.placeholder
                ? "border-dashed border-border bg-[color:var(--panel)]"
                : "border-border bg-card"
            }`}
          >
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-[color:var(--accent)]">
              {testimonial.label}
            </p>
            <blockquote
              className={`mt-5 text-sm leading-6 sm:text-base sm:leading-7 ${
                testimonial.placeholder ? "text-muted-foreground" : "text-foreground/80"
              }`}
            >
              {testimonial.placeholder ? testimonial.quote : <>&ldquo;{testimonial.quote}&rdquo;</>}
            </blockquote>
            <figcaption className="mt-6 flex items-center gap-3 border-t border-border pt-4">
              <cite className="block text-sm font-semibold not-italic">{testimonial.name}</cite>
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">Moves automatically. Hover or focus to pause.</p>
        <div className="flex gap-2" aria-label={`Testimonial ${activeIndex + 1} of ${TESTIMONIALS.length}`}>
          {TESTIMONIALS.map((testimonial, index) => (
            <button
              key={testimonial.name}
              type="button"
              aria-label={`Show testimonial ${index + 1}`}
              aria-current={activeIndex === index ? "true" : undefined}
              onClick={() => moveTo(index)}
              className={`alm-focus h-2.5 transition-[width,background-color] ${
                activeIndex === index ? "w-7 bg-[color:var(--accent)]" : "w-2.5 bg-border"
              }`}
            />
          ))}
        </div>
      </div>
    </>
  );
}
