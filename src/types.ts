export type Metadata = {
  name: string;
  description: string;
  image: string;
  image_integrity: string;
  image_mimetype:
    | "image/apng"
    | "image/avif"
    | "image/gif"
    | "image/jpeg"
    | "image/png"
    | "image/svg+xml"
    | "image/webp";
  external_url: string;
  properties: {
    [key: string]: string;
  };
};
