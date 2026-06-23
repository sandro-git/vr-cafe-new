// ./src/sanity/lib/url-for-image.ts
import { sanityClient } from 'sanity:client';
import imageUrlBuilder from "@sanity/image-url";
export const imageBuilder = imageUrlBuilder(sanityClient);

export function urlForImage(source: Parameters<typeof imageBuilder.image>[0]) {
    return imageBuilder.image(source);
}