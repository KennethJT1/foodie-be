import { z } from 'zod';

const text = (max, message) => z.string({ error: message }).trim().min(1, message).max(max);

const fields = {
  label: z.string().trim().min(1).max(40).optional(),
  line1: text(200, 'Enter the street address'),
  area: text(100, 'Enter the area'),
  city: text(100, 'Pick a city'),
  state: z.string().trim().max(100).optional(),
  lat: z.unknown().optional(),
  lng: z.unknown().optional(),
  directions: z.string().trim().max(300).optional(),
  isDefault: z.boolean().optional(),
};

const RANGES = { lat: 90, lng: 180 };
const PIN_MESSAGE = 'Drop a pin on the map';

/**
 * lat / lng problems are reported once, on `pin` (the map), as the frontend form expects.
 * On create both are required; on update only the ones sent are checked.
 */
const withPin = (shape, { required }) =>
  z
    .object(shape)
    // `when` makes this run even if other fields already failed, so every error shows at once
    .refine(
      (value) =>
        !Object.entries(RANGES).some(([key, max]) => {
          if (value?.[key] === undefined) return required;
          const n = Number(value[key]);
          return value[key] === null || value[key] === '' || !Number.isFinite(n) || Math.abs(n) > max;
        }),
      { path: ['pin'], message: PIN_MESSAGE, when: () => true },
    )
    .transform(({ lat, lng, ...rest }) => ({
      ...rest,
      ...(lat !== undefined && { lat: Number(lat) }),
      ...(lng !== undefined && { lng: Number(lng) }),
    }));

export const createAddressBody = withPin(fields, { required: true });
export const updateAddressBody = withPin(z.object(fields).partial().shape, { required: false });
export const addressIdParams = z.object({ id: z.string().min(1).max(64) });
