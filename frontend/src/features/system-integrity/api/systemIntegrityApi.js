import { apiRequest } from '../../auth/api/authApi';

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = window.atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function concatBytes(...byteArrays) {
  const totalLength = byteArrays.reduce((length, bytes) => length + bytes.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  byteArrays.forEach((bytes) => {
    combined.set(bytes, offset);
    offset += bytes.length;
  });

  return combined;
}

export async function decryptFooterPackage(footerPackage) {
  if (!footerPackage || footerPackage.algorithm !== 'AES-GCM') {
    throw new Error('Invalid protected footer package');
  }

  const key = await window.crypto.subtle.importKey(
    'raw',
    base64UrlToBytes(footerPackage.key),
    'AES-GCM',
    false,
    ['decrypt']
  );
  const encryptedPayload = concatBytes(base64UrlToBytes(footerPackage.payload), base64UrlToBytes(footerPackage.tag));
  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64UrlToBytes(footerPackage.iv),
    },
    key,
    encryptedPayload
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

export const systemIntegrityApi = {
  getFooterPackage: () => apiRequest('/system-integrity/footer'),
  validateFooterProof: (proof) => apiRequest(`/system-integrity/footer/validate?proof=${encodeURIComponent(proof)}`),
};
