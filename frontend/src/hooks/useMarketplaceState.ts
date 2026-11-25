import { useCallback, useState } from 'react';
import { products } from '../data';
import { scheduledShows } from '../data/shows';
import type { ScheduledShow } from '../types/show';
export function useMarketplaceState() {
  const [inventory, setInventory] = useState(products);
  const [shows, setShows] = useState(scheduledShows);
  const [saved, setSaved] = useState<string[]>([]),
    [following, setFollowing] = useState<string[]>([]);
  const toggleSave = useCallback(
    (id: string) => setSaved((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id])),
    [],
  );
  const toggleFollow = useCallback(
    (id: string) => setFollowing((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id])),
    [],
  );
  const scheduleShow = useCallback(
    (show: Omit<ScheduledShow, 'id'>) =>
      setShows((v) => [{ ...show, id: 'show-' + Date.now() }, ...v]),
    [],
  );
  return {
    inventory,
    setInventory,
    shows,
    saved,
    following,
    toggleSave,
    toggleFollow,
    scheduleShow,
  };
}
