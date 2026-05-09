export function CanvasLegend() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        right: 8,
        background: 'var(--panel-2)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 8,
        fontSize: 16,
        fontFamily: 'JetBrains Mono, monospace',
        color: 'var(--muted)',
        pointerEvents: 'none',
        zIndex: 1,
        lineHeight: 1.6,
      }}
    >
      <div style={{ color: 'var(--text)', marginBottom: 4 }}>Legend</div>
      <div>
        <span style={{ color: 'var(--info)' }}>━━</span> reference (variable / property)
      </div>
      <div>
        <span style={{ color: 'var(--accent2)' }}>━━</span> [[Prototype]]
      </div>
      <div style={{ color: 'var(--muted)' }}>drag header · click ▾/▸ collapse · wheel zoom</div>
    </div>
  );
}
