export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SelectionPayload {
  rect: ViewportRect;
  windowWidth: number;
  windowHeight: number;
  devicePixelRatio: number;
}

export interface CropResult {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
}

