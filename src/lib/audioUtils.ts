export function pcmToBase64(pcmData: Float32Array): string {
  const pcm16Data = new Int16Array(pcmData.length);
  for (let i = 0; i < pcmData.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    pcm16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  const buffer = new ArrayBuffer(pcm16Data.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < pcm16Data.length; i++) {
    view.setInt16(i * 2, pcm16Data[i], true);
  }
  
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToFloat32Array(base64: string): Float32Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const pcm16Data = new Int16Array(bytes.buffer);
  const pcmData = new Float32Array(pcm16Data.length);
  for (let i = 0; i < pcm16Data.length; i++) {
    pcmData[i] = pcm16Data[i] / (pcm16Data[i] < 0 ? 0x8000 : 0x7FFF);
  }
  
  return pcmData;
}
