import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatMonth(month: string): string {
  // month format: '2026-01'
  const [year, monthNum] = month.split('-');
  const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
  return format(date, 'MMM/yy', { locale: ptBR });
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd/MM/yyyy');
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd/MM/yyyy HH:mm');
}

export function getStatusColor(status: 'green' | 'yellow' | 'red'): string {
  switch (status) {
    case 'green':
      return 'bg-green-100 text-green-800';
    case 'yellow':
      return 'bg-yellow-100 text-yellow-800';
    case 'red':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getStatusEmoji(status: 'green' | 'yellow' | 'red'): string {
  switch (status) {
    case 'green':
      return '🟢';
    case 'yellow':
      return '🟡';
    case 'red':
      return '🔴';
    default:
      return '⚪';
  }
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'P0':
      return 'bg-red-100 text-red-800';
    case 'P1':
      return 'bg-orange-100 text-orange-800';
    case 'P2':
      return 'bg-blue-100 text-blue-800';
    case 'P3':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getOfferStatusColor(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-100 text-gray-800';
    case 'PROPOSED':
      return 'bg-blue-100 text-blue-800';
    case 'APPROVED':
      return 'bg-green-100 text-green-800';
    case 'SENT':
      return 'bg-purple-100 text-purple-800';
    case 'ACCEPTED':
      return 'bg-emerald-100 text-emerald-800';
    case 'REJECTED':
      return 'bg-red-100 text-red-800';
    case 'HOLD':
      return 'bg-yellow-100 text-yellow-800';
    case 'CANCELLED':
      return 'bg-gray-300 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getRequisitionStatusColor(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-100 text-gray-800';
    case 'OPEN':
      return 'bg-blue-100 text-blue-800';
    case 'INTERVIEWING':
      return 'bg-yellow-100 text-yellow-800';
    case 'OFFER_PENDING':
      return 'bg-purple-100 text-purple-800';
    case 'FILLED':
      return 'bg-green-100 text-green-800';
    case 'CANCELLED':
      return 'bg-gray-300 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
