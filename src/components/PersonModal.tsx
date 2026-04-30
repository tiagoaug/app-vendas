import { useState, useEffect } from 'react';
import { Person } from '../types';

interface PersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (person: Omit<Person, 'id'>) => void;
  person?: Person;
}

export default function PersonModal({ isOpen, onClose, onSave, person }: PersonModalProps) {
  const [name, setName] = useState(person?.name || '');
  const [phone, setPhone] = useState(person?.phone || '');
  const [email, setEmail] = useState(person?.email || '');
  const [document, setDocument] = useState(person?.document || '');
  const [isCustomer, setIsCustomer] = useState(person?.isCustomer || false);
  const [isSupplier, setIsSupplier] = useState(person?.isSupplier || false);

  useEffect(() => {
    if (person) {
      setName(person.name);
      setPhone(person.phone || '');
      setEmail(person.email || '');
      setDocument(person.document || '');
      setIsCustomer(person.isCustomer);
      setIsSupplier(person.isSupplier);
    }
  }, [person]);

  const handleImportContact = async () => {
    if ('contacts' in navigator && 'select' in (navigator as any).contacts) {
      if (window.self !== window.top) {
        alert('A importação de contatos não funciona dentro deste preview. Por favor, abra o aplicativo em uma nova aba.');
        return;
      }
      try {
        const props = ['name', 'tel', 'email'];
        const contacts = await (navigator as any).contacts.select(props, { multiple: false });
        if (contacts.length > 0) {
          const contact = contacts[0];
          setName(contact.name?.[0] || '');
          if (contact.tel && contact.tel.length > 0) setPhone(contact.tel[0]);
          if (contact.email && contact.email.length > 0) setEmail(contact.email[0]);
        }
      } catch (err) {
        console.error('Error importing contact:', err);
        alert('Erro ao importar contato.');
      }
    } else {
      alert('Seu navegador não suporta a importação de contatos.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-4">
        <h2 className="text-xl font-black text-slate-800 dark:text-white">
          {person ? 'Editar Registro' : 'Novo Registro'}
        </h2>
        
        <button
          onClick={handleImportContact}
          className="w-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-2 rounded-xl flex items-center justify-center gap-2 text-sm"
        >
          Importar da Agenda
        </button>

        <input
          type="text"
          placeholder="Nome (Obrigatório)"
          className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="tel"
          placeholder="Telefone (Obrigatório)"
          className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          type="email"
          placeholder="Email (Opcional)"
          className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="text"
          placeholder="CPF/CNPJ (Opcional)"
          className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3"
          value={document}
          onChange={(e) => setDocument(e.target.value)}
        />
        
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isCustomer} onChange={(e) => setIsCustomer(e.target.checked)} />
            <span className="text-sm">Cliente</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isSupplier} onChange={(e) => setIsSupplier(e.target.checked)} />
            <span className="text-sm">Fornecedor</span>
          </label>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300">Cancelar</button>
          <button 
            onClick={() => {
              if (!name || !phone) {
                alert('Nome e Telefone são obrigatórios');
                return;
              }
              onSave({ name, phone, email, document, isCustomer, isSupplier });
              onClose();
            }}
            className="flex-1 py-3 rounded-xl bg-indigo-600 font-bold text-white shadow-lg"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
