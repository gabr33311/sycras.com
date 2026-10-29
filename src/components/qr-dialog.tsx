import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { Download, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePrefs } from "@/lib/prefs";

/**
 * Small QR in the business card: just the code, in the text colour, no frame.
 * It is a button to the big one (dark on white), which is the one to scan.
 */
export function QrThumb({ url, onOpen }: { url: string; onOpen: () => void }) {
  const { t } = usePrefs();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("pf.qr.open")}
      title={t("pf.qr.open")}
      className="qr-breathe shrink-0 text-foreground"
    >
      <QRCodeSVG
        value={url}
        size={44}
        level="M"
        marginSize={0}
        bgColor="transparent"
        fgColor="currentColor"
      />
    </button>
  );
}

/** The QR at full size, to print or show at the counter; download as PNG. */
export function QrDialog({
  url,
  slug,
  name,
  open,
  onOpenChange,
}: {
  url: string;
  slug: string;
  name: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = usePrefs();

  function download() {
    const canvas = document.getElementById("qr-dialog-canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${slug}-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm text-center [&>button:last-child]:hidden">
        <DialogTitle className="font-display text-xl">{name}</DialogTitle>
        <DialogDescription>{t("pf.qr.desc")}</DialogDescription>
        <div className="mx-auto mt-2 w-full max-w-[18rem] rounded-2xl bg-white p-4">
          {/* High resolution for printing; scaled down on screen. */}
          <QRCodeCanvas
            id="qr-dialog-canvas"
            value={url}
            size={1024}
            level="M"
            marginSize={2}
            style={{ width: "100%", height: "auto", aspectRatio: "1" }}
          />
        </div>
        <p className="truncate text-sm font-bold text-brand-ink">
          {url.replace(/^https?:\/\//, "")}
        </p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="size-4" />
            {t("pf.qr.close")}
          </Button>
          <Button onClick={download}>
            <Download className="size-4" />
            {t("pf.qr.download")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
