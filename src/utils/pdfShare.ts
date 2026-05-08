import jsPDF from 'jspdf';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

// Helper to convert ArrayBuffer to Base64 safely
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export const sharePDF = async (doc: jsPDF, fileName: string) => {
  if (Capacitor.isNativePlatform()) {
    try {
      const pdfArrayBuffer = doc.output('arraybuffer');
      const base64Data = arrayBufferToBase64(pdfArrayBuffer);

      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
      });

      await Share.share({
        title: fileName,
        text: 'Enviando documento...',
        url: savedFile.uri,
        dialogTitle: 'Compartilhar Documento',
      });
    } catch (error: any) {
      console.error('Error sharing PDF:', error);
      alert(`Erro ao salvar/compartilhar PDF.`);
    }
  } else {
    try {
      doc.save(fileName);
    } catch (error: any) {
      console.error('Error saving PDF:', error);
      alert(`Erro ao baixar PDF.`);
    }
  }
};

export const shareImage = async (base64Data: string, fileName: string) => {
  const base64Only = base64Data.includes('base64,') 
    ? base64Data.split('base64,')[1] 
    : base64Data;

  if (Capacitor.isNativePlatform()) {
    try {
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Only,
        directory: Directory.Cache,
      });

      await Share.share({
        title: fileName,
        text: 'Enviando imagem...',
        url: savedFile.uri,
        dialogTitle: 'Compartilhar Imagem',
      });
    } catch (error: any) {
      console.error('Error sharing Image:', error);
      alert(`Erro ao salvar/compartilhar imagem.`);
    }
  } else {
    try {
      const link = document.createElement('a');
      link.href = base64Data.startsWith('data:') ? base64Data : `data:image/jpeg;base64,${base64Data}`;
      link.download = fileName;
      link.click();
    } catch (error: any) {
      console.error('Error downloading image:', error);
      alert('Erro ao baixar imagem.');
    }
  }
};
