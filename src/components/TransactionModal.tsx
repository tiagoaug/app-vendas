import { useState, useEffect, useRef } from 'react';
import { Transaction, TransactionType, Category, CategoryType, Account, Person, FamilyMember, GeneralPurchaseItem } from '../types';
import { X, Calendar, DollarSign, Tag, Wallet, User, CheckCircle2, Clock, Users, Calculator as CalculatorIcon, Hash, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import CalculatorPopover from './CalculatorPopover';
import ComboBox from './ComboBox';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transaction: Omit<Transaction, 'id'>) => void;
  categories: Category[];
  accounts: Account[];
  people: Person[];
  familyMembers?: FamilyMember[];
  initialType?: TransactionType;
  transaction?: Transaction;
  initialValue?: number;
  isDarkMode?: boolean;
}

export default function TransactionModal({ 
  isOpen, 
  onClose, 
  onSave, 
  categories, 
  accounts, 
  people,
  familyMembers = [],
  initialType = TransactionType.INCOME,
  transaction,
  initialValue,
  isDarkMode = false
}: TransactionModalProps) {
  const [type, setType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState<number | string>(0);
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [contactId, setContactId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [status, setStatus] = useState<'PENDING' | 'COMPLETED'>('COMPLETED');
  const [transactionNumber, setTransactionNumber] = useState(Math.floor(Math.random() * 100000).toString().padStart(5, '0'));
  const [isAutoNumber, setIsAutoNumber] = useState(true);
  const [items, setItems] = useState<GeneralPurchaseItem[]>([]);
  const [activeCalculator, setActiveCalculator] = useState<{ type: 'main' | 'item', index?: number } | null>(null);

  useEffect(() => {
    if (transaction) {
      setType(transaction.type);
      setAmount(transaction.amount);
      setDescription(transaction.description);
      setCategoryId(transaction.categoryId);
      setAccountId(transaction.accountId);
      setContactId(transaction.contactId || '');
      setMemberId(transaction.memberId || '');
      setDate(format(transaction.date, 'yyyy-MM-dd'));
      setStatus(transaction.status);
      setTransactionNumber(transaction.transactionNumber || '');
      setItems(transaction.items || []);
      setIsAutoNumber(false);
    } else {
      setType(initialType);
      setAmount(initialValue !== undefined ? initialValue : 0);
      setDescription('');
      const defaultAcc = accounts.find(a => a.isDefault) || (accounts || []).find(a => a.type !== 'PERSONAL' as any) || (accounts || [])[0];
      setAccountId(defaultAcc?.id || '');
      setContactId('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setStatus('COMPLETED');
      if (isAutoNumber) {
        setTransactionNumber(Math.floor(Math.random() * 100000).toString().padStart(5, '0'));
      }
      setItems([]);
      
      const filteredCats = (categories || []).filter(c => 
        initialType === TransactionType.INCOME ? c.type === CategoryType.REVENUE : c.type === CategoryType.EXPENSE
      );
      setCategoryId(filteredCats[0]?.id || '');
    }
  }, [transaction, initialType, isOpen, categories, accounts, initialValue]);

  // Update category when type changes if not editing
  useEffect(() => {
    if (!transaction && isOpen) {
      const filteredCats = (categories || []).filter(c => 
        type === TransactionType.INCOME ? c.type === CategoryType.REVENUE : c.type === CategoryType.EXPENSE
      );
      if (!filteredCats.find(c => c.id === categoryId)) {
        setCategoryId(filteredCats[0]?.id || '');
      }
    }
  }, [type, categories, isOpen, transaction]);

  const handleSave = () => {
    if (!description || !amount || !categoryId || !accountId) {
      alert('Preencha todos os campos obrigatórios');
      return;
    }

    const contact = (people || []).find(p => p.id === contactId);
    
    const finalAmount = (items || []).length > 0 
      ? (items || []).reduce((acc, item) => acc + (Number(item.value) || 0), 0)
      : Number(amount);

    onSave({
      type,
      amount: finalAmount,
      description,
      categoryId,
      accountId,
      contactId: contactId || undefined,
      contactName: contact?.name,
      date: new Date(date + 'T12:00:00').getTime(),
      status,
      memberId: memberId || undefined,
      transactionNumber: transactionNumber || undefined,
      items: (items || []).length > 0 ? items : undefined,
    });
    onClose();
  };

  const addItem = () => {
    setItems([...items, { id: Math.random().toString(36).substr(2, 9), description: '', value: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, updates: Partial<GeneralPurchaseItem>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    setItems(newItems);
  };

  const totalFromItems = (items || []).reduce((acc, item) => acc + (Number(item.value) || 0), 0);

  useEffect(() => {
    if ((items || []).length > 0) {
      setAmount(totalFromItems);
    }
  }, [items, totalFromItems]);

  const handleAmountChange = (val: string) => {
    if (amount === 0 || amount === '0') {
      setAmount(val.replace(/^0+/, ''));
    } else {
      setAmount(val);
    }
  };

  if (!isOpen) return null;

  const filteredCategories = (categories || []).filter(c => 
    type === TransactionType.INCOME ? c.type === CategoryType.REVENUE : c.type === CategoryType.EXPENSE
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overscroll-contain">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] sm:max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-800 dark:text-white leading-none">
              {transaction ? 'Editar Lançamento' : 'Novo Lançamento'}
            </h2>
            
            <div className="flex items-center gap-2 mt-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <div className="relative inline-block w-8 h-4">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isAutoNumber}
                    onChange={() => setIsAutoNumber(!isAutoNumber)}
                  />
                  <div className={`w-8 h-4 rounded-full transition-colors ${isAutoNumber ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                  <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform shadow-sm ${isAutoNumber ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <span className={`text-[8px] font-black uppercase tracking-widest transition-colors ${isAutoNumber ? 'text-indigo-500' : 'text-slate-400'}`}>
                  Auto
                </span>
              </label>

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  className={`text-[10px] bg-transparent border-b border-transparent focus:border-indigo-500 outline-none font-black uppercase tracking-widest min-w-0 w-20 ${isAutoNumber ? 'text-slate-400' : 'text-indigo-500'}`}
                  value={transactionNumber}
                  placeholder="00000"
                  onChange={(e) => {
                    setTransactionNumber(e.target.value);
                    setIsAutoNumber(false);
                  }}
                  disabled={isAutoNumber}
                />
              </div>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-colors text-slate-400"
          >
            <X size={24} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {/* Type Selector */}
          <div className="flex bg-slate-50 dark:bg-slate-800 p-1.5 rounded-3xl border border-slate-100 dark:border-slate-700">
            <button
              onClick={() => setType(TransactionType.INCOME)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${type === TransactionType.INCOME ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-100' : 'text-slate-400'}`}
            >
              <CheckCircle2 size={16} /> Entradas
            </button>
            <button
              onClick={() => setType(TransactionType.EXPENSE)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${type === TransactionType.EXPENSE ? 'bg-rose-500 text-white shadow-xl shadow-rose-100' : 'text-slate-400'}`}
            >
              <Clock size={16} /> Saídas
            </button>
          </div>

          {/* Contact Link */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-2">
              <User size={10} /> Vínculo (Cliente/Fornecedor)
            </label>
            <ComboBox
              options={(people || []).map(p => ({ 
                id: p.id, 
                name: `${p.name} ${p.isCustomer && p.isSupplier ? '(CLI/FOR)' : p.isCustomer ? '(CLI)' : '(FOR)'}`
              }))}
              value={contactId}
              onChange={setContactId}
              placeholder="Sem vínculo"
            />
          </div>

          {/* Items Detailing */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Detalhamento de Itens</label>
              <button
                onClick={addItem}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-600 transition-colors"
              >
                <Plus size={14} strokeWidth={3} /> Adicionar Item
              </button>
            </div>
            
            <div className="space-y-2">
              {(items || []).map((item, index) => (
                <div key={item.id} className="flex flex-col gap-2 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 relative animate-in slide-in-from-top-1">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Descrição do item..."
                      className="flex-1 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold dark:text-white focus:ring-2 focus:ring-indigo-500/10 outline-none uppercase"
                      value={item.description}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                    />
                    <button
                      onClick={() => removeItem(index)}
                      className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl py-2 pl-8 pr-10 text-xs font-bold dark:text-white focus:ring-2 focus:ring-indigo-500/10 outline-none"
                        placeholder="0,00"
                        value={item.value || ''}
                        onChange={(e) => updateItem(index, { value: parseFloat(e.target.value) || 0 })}
                      />
                      <button
                        type="button"
                        onClick={() => setActiveCalculator({ type: 'item', index })}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-indigo-400"
                      >
                        <CalculatorIcon size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {(items || []).length > 0 && (
                <div className="flex justify-between items-center px-4 py-2 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100/50 dark:border-indigo-900/30">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Total dos Itens</span>
                  <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                    R$ {totalFromItems.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Main Financial Fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                  {(items || []).length > 0 ? 'Valor Total (R$)' : 'Valor (R$)'}
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input
                    type="number"
                    step="0.01"
                    className={`w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl py-4 pl-12 pr-12 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all dark:text-white ${(items || []).length > 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
                    placeholder="0,00"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    readOnly={(items || []).length > 0}
                  />
                  {(items || []).length === 0 && (
                    <button 
                      type="button"
                      onClick={() => setActiveCalculator({ type: 'main' })}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-indigo-400"
                    >
                      <CalculatorIcon size={18} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Data</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input
                    type="date"
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all dark:text-white"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Descrição do Lançamento</label>
              <input
                type="text"
                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl py-4 px-5 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all dark:text-white uppercase"
                placeholder="Ex: RECEBIMENTO DE VENDA..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-2">
                  <Tag size={10} /> Categoria
                </label>
                <ComboBox
                  options={filteredCategories.map(c => ({ id: c.id, name: c.name }))}
                  value={categoryId}
                  onChange={setCategoryId}
                  placeholder="Selecione..."
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-2">
                  <Wallet size={10} /> Conta
                </label>
                <ComboBox
                  options={(accounts || []).map(a => ({ id: a.id, name: a.name }))}
                  value={accountId}
                  onChange={setAccountId}
                  placeholder="Selecione..."
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
               <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Status</label>
               <div className="flex gap-2">
                  <button 
                    onClick={() => setStatus('COMPLETED')}
                    className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${status === 'COMPLETED' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-400'}`}
                  >
                    Concluído
                  </button>
                  <button 
                    onClick={() => setStatus('PENDING')}
                    className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${status === 'PENDING' ? 'bg-amber-500 border-amber-500 text-white shadow-lg' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-400'}`}
                  >
                    Pendente
                  </button>
               </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            onClick={handleSave}
            disabled={!description || !amount || !categoryId || !accountId}
            className="w-full bg-slate-900 dark:bg-indigo-600 text-white py-4 rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-indigo-100 dark:shadow-none active:scale-[0.98] transition-all disabled:opacity-50"
          >
            Confirmar Lançamento
          </button>
        </div>

        {/* Calculator */}
        {activeCalculator && (
          <CalculatorPopover 
            onApply={(val) => {
              if (activeCalculator.type === 'main') {
                setAmount(val);
              } else if (activeCalculator.index !== undefined) {
                updateItem(activeCalculator.index, { value: val });
              }
              setActiveCalculator(null);
            }} 
            onClose={() => setActiveCalculator(null)} 
          />
        )}
      </div>
    </div>
  );
}
