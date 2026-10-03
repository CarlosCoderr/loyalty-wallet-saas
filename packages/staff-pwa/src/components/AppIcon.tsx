// Ícono de la app para ImageResponse (manifest e iOS): una tarjeta con sellos, solo con formas.
// Sin texto a propósito: un carácter obliga a descargar una fuente durante el build.
// Solo estilos inline con flex: lo dibuja Satori, no el navegador.
export function AppIcon({ size }: { size: number }) {
  const u = size / 100; // unidad relativa al tamaño del ícono
  const stamp = (filled: boolean) => (
    <div
      style={{
        width: 14 * u,
        height: 14 * u,
        borderRadius: 7 * u,
        background: filled ? '#1e3a8a' : 'white',
        border: `${2.5 * u}px solid #1e3a8a`,
      }}
    />
  );
  const row = (filled: number) => (
    <div style={{ display: 'flex', gap: 5 * u }}>
      {[0, 1, 2].map((i) => stamp(i < filled))}
    </div>
  );

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e3a8a' }}>
      <div
        style={{
          width: 64 * u,
          height: 50 * u,
          borderRadius: 8 * u,
          background: 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5 * u,
        }}
      >
        {row(3)}
        {row(1)}
      </div>
    </div>
  );
}
