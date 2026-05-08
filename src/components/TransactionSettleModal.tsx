import { useState, useEffect } from 'react';
import { Transaction, Account, TransactionType } from '../types';
import { X, DollarSign, Wallet, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TransactionSettleModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction;
  accounts: Account[];
  onSettle: (amount: number, accountId: string, note: string) => Promise<void>;
  isDarkMode: boolean;
}

export default function TransactionSettleModal({
  isOpen,
  onClose,
  transaction,
  accounts,
  onSettle,
  isDarkMode
}: TransactionSettleModalProps) {
  const [amount, setAmount] = useState<number | string>(transaction.amount);
  const [accountId, setAccountId] = useState(transaction.accountId || (accounts.find(a => a.isDefault)?.id || accounts[0]?.id || ''));
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmount(transaction.amount);
      setAccountId(transaction.accountId || (accounts.find(a => a.isDefault)?.id || accounts[0]?.id || ''));
      setNote('');
    }
  }, [isOpen, transaction, accounts]);

  if (!isOpen) return null;

  const handleAmountChange = (val: string) => {
    if (val === '') {
      setAmount('');
      return;
    }

    // Remove leading zeros if not decimal (0.5 is okay)
    let processed = val;
    if (processed.length > 1 && processed.startsWith('0') && processed[1] !== '.') {
      processed = processed.replace(/^0+/, '');
    }

    setAmount(processed);
  };

  const handleConfirm = async () => {
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      alert('O valor deve ser maior que zero');
      return;
    }
    if (numericAmount > transaction.amount) {
      alert('O valor não pode ser maior que o total pendente');
      return;
    }
    if (!accountId) {
      alert('Selecione uma conta para o lançamento');
      return;
    }

    try {
      setLoading(true);
      await onSettle(numericAmount, accountId, note);
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const remaining = transaction.amount - Number(amount);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className={`relative w-full max-w-md overflow-hidden rounded-[2.5rem] shadow-2xl ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}`}
      >
        {/* Header */}
        <div className="p-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${transaction.type === TransactionType.INCOME ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
              <DollarSign size={20} strokeWidth={3} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight">Baixa de Lançamento</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{transaction.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor do Pagamento</label>
              <div className="text-[10px] font-bold text-slate-400">Total: R$ {transaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </div>
            <div className={`flex items-center gap-3 px-4 h-14 rounded-2xl border-2 transition-all focus-within:ring-4 focus-within:ring-indigo-500/10 ${isDarkMode ? 'bg-slate-950 border-slate-800 focus-within:border-indigo-500' : 'bg-slate-50 border-slate-100 focus-within:border-indigo-500'}`}>
              <span className="text-lg font-black text-slate-400">R$</span>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="flex-1 bg-transparent text-xl font-black focus:outline-none"
                placeholder="0,00"
              />
              {Number(amount) !== transaction.amount && (
                <button
                  onClick={() => setAmount(transaction.amount)}
                  className="text-[10px] font-black text-indigo-500 uppercase hover:underline"
                >
                  Total
                </button>
              )}
            </div>

            {remaining > 0.01 && (
              <div className="flex items-center justify-between px-1 animate-in slide-in-from-top-1 duration-300">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Saldo Remanescente:</span>
                <span className="text-[10px] font-black text-amber-500">R$ {remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>

          {/* Account Selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Conta de Destino/Origem</label>
            <div className={`flex items-center gap-3 px-4 h-14 rounded-2xl border-2 transition-all ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
              <Wallet size={18} className="text-slate-400" />
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="flex-1 bg-transparent text-xs font-black uppercase focus:outline-none cursor-pointer"
              >
                <option value="">Selecionar Conta</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} (R$ {acc.balance.toLocaleString('pt-BR')})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Observação (Opcional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: Pagamento via PIX, desconto, etc..."
              className={`w-full p-4 rounded-2xl border-2 h-24 text-xs font-bold focus:outline-none transition-all ${isDarkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500' : 'bg-slate-50 border-slate-100 focus:border-indigo-500'}`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className={`p-6 border-t ${isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50/50 border-slate-100'}`}>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`w-full h-14 rounded-2xl flex items-center justify-center gap-3 text-sm font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl ${transaction.type === TransactionType.INCOME
                ? 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600'
                : 'bg-rose-500 text-white shadow-rose-500/20 hover:bg-rose-600'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle2 size={20} strokeWidth={3} />
                Confirmar Baixa
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
