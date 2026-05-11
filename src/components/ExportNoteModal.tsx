import React, { useState } from 'react';
import { X, FileText, FileImage, MessageSquare, Send } from 'lucide-react';

interface ExportNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (observation: string, type: 'PDF' | 'JPG') => void;
  type: 'PDF' | 'JPG';
  isDarkMode: boolean;
}

export default function ExportNoteModal({ isOpen, onClose, onConfirm, type, isDarkMode }: ExportNoteModalProps) {
  const [observation, setObservation] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div 
        className={`w-full max-w-md rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300 ${isDarkMode ? 'bg-slate-900 border border-slate-800' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 flex justify-between items-start border-b border-slate-50 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${type === 'PDF' ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600'}`}>
              {type === 'PDF' ? <FileText size={20} strokeWidth={2.5} /> : <FileImage size={20} strokeWidth={2.5} />}
            </div>
            <div>
              <h3 className={`text-sm font-black uppercase tracking-tight leading-none ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {type === 'PDF' ? 'Exportar PDF' : 'Exportar Imagem'}
              </h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-1 uppercase tracking-widest">Adicione uma observação ao arquivo</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isDarkMode ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <MessageSquare size={14} className="text-indigo-500" />
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Observação Interna / Rodapé</label>
            </div>
            <textarea
              autoFocus
              className={`w-full min-h-[120px] p-5 rounded-2xl text-xs font-medium leading-relaxed outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none ${
                isDarkMode 
                  ? 'bg-slate-800/50 text-slate-200 placeholder-slate-600' 
                  : 'bg-slate-50 text-slate-700 placeholder-slate-400'
              }`}
              placeholder="Digite aqui alguma observação importante para constar no documento..."
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
            />

            <div className="flex flex-wrap gap-2 pt-1">
              {[
                "O DESCONTO É PELO PEDIDO ESTAR NO SAQUINHO",
                "PEDIDO PARA RETIRADA NO LOCAL",
                "FRETE POR CONTA DO CLIENTE",
                "PAGAMENTO À VISTA"
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setObservation(prev => prev ? `${prev}\n${preset}` : preset)}
                  className={`px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all border ${
                    isDarkMode 
                      ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600' 
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  {preset.length > 25 ? `${preset.substring(0, 25)}...` : preset}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                isDarkMode ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirm(observation, type)}
              className={`flex-[2] py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${
                type === 'PDF'
                  ? 'bg-rose-600 text-white shadow-rose-600/20 hover:bg-rose-700'
                  : 'bg-blue-600 text-white shadow-blue-600/20 hover:bg-blue-700'
              }`}
            >
              <Send size={14} />
              Gerar {type}
            </button>
          </div>
        </div>

        <div className={`p-4 text-center ${isDarkMode ? 'bg-slate-800/30' : 'bg-slate-50/50'}`}>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            O texto será posicionado no final do documento
          </p>
        </div>
      </div>
    </div>
  );
}
