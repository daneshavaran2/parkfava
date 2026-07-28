// Ambient types for FAVA vendor scripts (loaded from public/vendor/*).
// Keeps strict TS happy while letting us use window.FAVA & friends.

export {};

declare global {
  interface FavaColor { base: string; glow: string; name?: string }
  interface FavaCategory {
    id: string; title: string; color: string; icon: string;
    companies: number; desc: string;
  }
  interface FavaPark {
    id: string; name: string; province: string; city: string;
    companies: number; jobs: number; area: number; color: string;
    mx: number; my: number;
  }
  interface FavaCompany {
    id: string; name: string; initials: string; category: string; color: string;
    tagline: string; founded: number | null; workers: number | null;
    parkId: string; city: string; products: string[];
    contact: { email?: string; website?: string; phone?: string };
    address: string; tags: string[];
  }
  interface FavaStats {
    parks: number; provinces: number; companies: number; jobs: number;
    exports: number; growth: number;
  }
  interface FavaData {
    COLORS: Record<string, FavaColor>;
    CATEGORIES: FavaCategory[];
    PARKS: FavaPark[];
    COMPANIES: FavaCompany[];
    STATS: FavaStats;
    SERVICES: Array<{ id: string; icon: string; color: string; title: string; desc: string }>;
    NEWS: Array<{ id: string; cat: string; color: string; date: string; title: string; excerpt: string }>;
    CALLS: Array<{ id: string; color: string; title: string; deadline: string; tag: string }>;
  }
  interface IranProvince { id: string; title: string; d: string; cx: number; cy: number }

  interface Window {
    FAVA: FavaData;
    IRAN_PROVINCES: IranProvince[];
    IRAN_VIEWBOX?: [number, number, number, number];
    qrMatrix: (text: string) => { size: number; modules: boolean[][] };
    __fava3d?: boolean;
    __robotPointer?: boolean;
    claude?: { complete: (prompt: string) => Promise<string> };
  }

  namespace JSX {
    interface IntrinsicElements {
      'image-slot': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        id?: string; shape?: string; radius?: string | number;
        placeholder?: string; src?: string; fit?: string;
      };
    }
  }
}
