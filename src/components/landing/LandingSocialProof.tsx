import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface BannerClient {
  id: string;
  corretor_page_url: string;
  business_name: string;
  avatar_url: string | null;
  display_order: number;
}

function ClientCard({ client }: { client: BannerClient }) {
  const initials = client.business_name
    .split(' ')
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  return (
    <a
      href={client.corretor_page_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center gap-3 px-4 group flex-shrink-0"
      style={{ minWidth: '96px' }}
      draggable={false}
    >
      <div className="h-16 w-16 rounded-full overflow-hidden bg-white border hairline flex items-center justify-center transition-all duration-200 group-hover:scale-105 group-hover:-translate-y-0.5 flex-shrink-0">
        {client.avatar_url ? (
          <img
            src={client.avatar_url}
            alt={client.business_name}
            width={64}
            height={64}
            loading="lazy"
            className="h-full w-full object-cover"
            draggable={false}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                parent.innerHTML = `<span class="font-display font-semibold text-[14px] text-ink-500">${initials}</span>`;
              }
            }}
          />
        ) : (
          <span className="font-display font-semibold text-[14px] text-ink-500">{initials}</span>
        )}
      </div>
      <span className="text-[12px] text-ink-700 font-medium group-hover:text-ink-900 transition-colors text-center line-clamp-2 max-w-[104px] leading-tight">
        {client.business_name}
      </span>
    </a>
  );
}

function CounterCard() {
  return (
    <div
      className="flex flex-col items-center gap-3 px-4 flex-shrink-0"
      style={{ minWidth: '96px' }}
    >
      <div className="h-16 w-16 rounded-full bg-ink-900 flex items-center justify-center flex-shrink-0">
        <span className="font-display font-semibold text-white text-[15px] tracking-[-0.02em] leading-none">
          +3K
        </span>
      </div>
      <span className="text-[12px] text-ink-700 font-medium text-center max-w-[104px] leading-tight">
        usuários ativos
      </span>
    </div>
  );
}

export default function LandingSocialProof() {
  const [clients, setClients] = useState<BannerClient[]>([]);
  const [loaded, setLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const isVisibleRef = useRef(false);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const { data, error } = await supabase
          .from('banner_clients')
          .select('id, corretor_page_url, business_name, avatar_url, display_order')
          .eq('is_active', true)
          .order('display_order', { ascending: true });

        if (error) throw error;
        setClients(data || []);
      } catch (error) {
        console.error('Error fetching banner clients:', error);
      } finally {
        setLoaded(true);
      }
    };

    fetchClients();
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => { isVisibleRef.current = entry.isIntersecting; },
      { threshold: 0.05 }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!loaded || !container || clients.length === 0) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const step = () => {
      if (container && isVisibleRef.current) {
        container.scrollLeft += 0.6;
        const half = container.scrollWidth / 2;
        if (container.scrollLeft >= half) {
          container.scrollLeft = 0;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [loaded, clients.length]);

  if (!loaded || clients.length === 0) return null;

  const itemsWithCounter = [...clients, null];
  const duplicated = [...itemsWithCounter, ...itemsWithCounter];

  return (
    <div ref={sectionRef} className="mt-14 rounded-2xl border hairline bg-surface py-10 overflow-hidden">
      <div
        className="relative"
        style={{ maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)' }}
      >
        <style>{`.landing-social-proof-track::-webkit-scrollbar { display: none; }`}</style>
        <div
          ref={containerRef}
          className="landing-social-proof-track flex items-start overflow-x-scroll"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {duplicated.map((client, index) =>
            client === null ? (
              <CounterCard key={`counter-${index}`} />
            ) : (
              <ClientCard key={`${client.id}-${index}`} client={client} />
            )
          )}
        </div>
      </div>
    </div>
  );
}
