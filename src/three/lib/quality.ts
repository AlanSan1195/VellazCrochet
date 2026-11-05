/**
 * Pantallas táctiles (móviles y tabletas): menos densidad de píxeles y puntadas con
 * menos polígonos. A su tamaño en pantalla la diferencia no se nota y va mucho más fluido.
 */
export const COARSE_POINTER = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
