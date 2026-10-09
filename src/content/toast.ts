export class InPageToast {
  public static show(message: string, durationMs = 3000, isError = false): void {
    const existing = document.getElementById('textsnip-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'textsnip-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '28px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.backgroundColor = isError ? '#ef4444' : '#111827';
    toast.style.color = '#ffffff';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '9999px';
    toast.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.3)';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = '500';
    toast.style.zIndex = '2147483647';
    toast.style.pointerEvents = 'none';
    toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    toast.style.opacity = '0';
    toast.textContent = message;

    document.documentElement.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    // Remove after duration
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(10px)';
      setTimeout(() => toast.remove(), 200);
    }, durationMs);
  }
}

