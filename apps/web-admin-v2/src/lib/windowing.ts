import { useState, useEffect, useRef, useCallback } from 'react';

interface WindowingOptions {
  totalItems: number;
  itemHeight: number;
  overscan?: number;
}

/**
 * Lightweight custom windowing/virtual scroll hook
 * Avoids heavy external virtual list libraries while maintaining 60fps on large lists
 */
export function useWindowing({ totalItems, itemHeight, overscan = 5 }: WindowingOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    ro.observe(el);
    setContainerHeight(el.clientHeight || 600);

    return () => {
      ro.disconnect();
    };
  }, []);

  const totalHeight = totalItems * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(totalItems, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan);

  const visibleIndices: number[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    visibleIndices.push(i);
  }

  const offsetY = startIndex * itemHeight;

  return {
    containerRef,
    handleScroll,
    totalHeight,
    visibleIndices,
    offsetY,
    startIndex,
    endIndex,
  };
}
