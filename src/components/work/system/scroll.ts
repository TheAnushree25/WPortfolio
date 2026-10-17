'use client';

import { createContext, useContext, type RefObject } from 'react';

/**
 * The system viewer's scroller, for chapters whose motion follows the reading
 * (a screen that straightens as it arrives, a browser that turns its pages).
 */
export const ViewerScroll = createContext<RefObject<HTMLDivElement | null> | null>(null);

export const useViewerScroll = () => useContext(ViewerScroll);
