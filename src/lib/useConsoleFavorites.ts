import { useState, useCallback } from "react";

const STORAGE_KEY = "console-command-favorites";

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveFavorites(fav: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...fav]));
  } catch {
    // ignore
  }
}

export function useConsoleFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);

  const toggleFavorite = useCallback((command: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(command)) {
        next.delete(command);
      } else {
        next.add(command);
      }
      saveFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (command: string) => favorites.has(command),
    [favorites]
  );

  return { favorites, toggleFavorite, isFavorite };
}
