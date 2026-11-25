import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  assignSupportTicket, decideSupportRefund, escalateSupportTicket, getSupportTicket,
  issueSupportRefund, listSupportTickets, replyToSupportTicket, updateSupportTicketStatus,
  type SupportTicket,
} from '../../api/support';
import { ApiError } from '../../lib/api-client';
import { colors, radii, spacing, typography } from '../../theme';
import { inputStyle, primaryButtonStyle, textareaStyle } from '../../components/formStyles';
import { formatMoney } from '../../lib/money';

const statuses = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'ESCALATED'];

export function SupportPage() {
  const { user } = useAuth();
  const finance = user?.role === 'FINANCE';
  const lead = user?.role === 'SUPPORT_LEAD' || user?.role === 'ADMIN';
  const canReply = ['SUPPORT_AGENT', 'SUPPORT_LEAD', 'ADMIN'].includes(user?.role ?? '');
  const [items, setItems] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [filter, setFilter] = useState('');
  const [assignee, setAssignee] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async (selectedId?: string) => {
    try {
      const page = await listSupportTickets(filter || undefined);
      setItems(page.items);
      if (selectedId) setSelected(await getSupportTicket(selectedId));
      else if (selected) setSelected(page.items.find((ticket) => ticket.id === selected.id) ?? null);
      setError('');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not load support cases.'); }
  }, [filter, selected]);

  useEffect(() => { void refresh(); }, [filter]);

  async function act(action: () => Promise<unknown>) {
    if (!selected) return;
    setBusy(true); setError('');
    try { await action(); await refresh(selected.id); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'The action failed.'); }
    finally { setBusy(false); }
  }

  return <div>
    <h1 style={{ fontSize: typography.section, color: colors.text, margin: 0 }}>Customer support</h1>
    <p style={{ color: colors.textSecondary }}>Review customer cases and follow up on order requests.</p>
    <label style={{ display: 'block', marginBottom: spacing.md, color: colors.textSecondary }}>
      Filter by status{' '}
      <select value={filter} onChange={(event) => setFilter(event.target.value)} style={inputStyle}>
        <option value="">All cases</option>{statuses.map((status) => <option key={status}>{status}</option>)}
      </select>
    </label>
    {error && <div role="alert" style={{ color: colors.urgent, marginBottom: spacing.md }}>{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.8fr) minmax(400px, 1.5fr)', gap: spacing.lg }}>
      <section style={panelStyle}>
        {items.map((ticket) => <button key={ticket.id} onClick={() => { setSelected(ticket); setAssignee(ticket.assignedToUserId ?? ''); }} style={caseButtonStyle(selected?.id === ticket.id)}>
          <strong>{ticket.subject}</strong><div>{ticket.status.replaceAll('_', ' ')} · {ticket.refundDecision}</div><small>{ticket.id}</small>
        </button>)}
        {items.length === 0 && <p style={{ color: colors.textSecondary }}>No support cases in this view.</p>}
      </section>
      <section style={panelStyle}>
        {!selected ? <p style={{ color: colors.textSecondary }}>Choose a case to see its messages and available actions.</p> : <>
          <h2 style={{ marginTop: 0 }}>{selected.subject}</h2>
          <div style={{ color: colors.textSecondary, marginBottom: spacing.md }}>Customer {selected.customerUserId} · Order {selected.orderId ?? 'none'} · {selected.status}</div>
          {selected.refundDecision !== 'NONE' && <div style={{ padding: spacing.md, marginBottom: spacing.md, background: colors.desktop, borderRadius: radii.button }}>
            Refund request: {selected.requestedRefundAmount === null ? 'No amount' : formatMoney(selected.requestedRefundAmount, selected.currency ?? 'USD')} · {selected.refundReason ?? 'No reason provided'}
          </div>}
          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {selected.messages.map((message) => <article key={message.id} style={messageStyle}>
              <small>{message.authorId} · {new Date(message.createdAt).toLocaleString()}</small><p style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{message.body}</p>
            </article>)}
          </div>
          {canReply && <div style={{ marginTop: spacing.md }}>
            <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={3} maxLength={5000} placeholder="Reply to the customer" style={textareaStyle} />
            <button disabled={busy || !reply.trim()} onClick={() => void act(async () => { await replyToSupportTicket(selected.id, reply.trim()); setReply(''); })} style={primaryButtonStyle}>Send reply</button>
          </div>}
          {lead && <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md, alignItems: 'center' }}>
            <input value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="Support agent user ID" style={inputStyle} />
            <button disabled={busy || !assignee.trim()} onClick={() => void act(() => assignSupportTicket(selected.id, assignee.trim()))} style={primaryButtonStyle}>Assign</button>
            <button disabled={busy} onClick={() => void act(() => escalateSupportTicket(selected.id))} style={primaryButtonStyle}>Escalate</button>
          </div>}
          {canReply && <label style={{ display: 'block', marginTop: spacing.md }}>Case status{' '}
            <select value={selected.status === 'ESCALATED' ? 'IN_PROGRESS' : selected.status} disabled={busy} onChange={(event) => void act(() => updateSupportTicketStatus(selected.id, event.target.value))} style={inputStyle}>
              {statuses.filter((status) => status !== 'ESCALATED').map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>}
          {finance && selected.refundDecision === 'PENDING' && <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.lg }}>
            <button disabled={busy} onClick={() => void act(() => decideSupportRefund(selected.id, 'APPROVED'))} style={primaryButtonStyle}>Approve refund</button>
            <button disabled={busy} onClick={() => void act(() => decideSupportRefund(selected.id, 'DENIED'))} style={primaryButtonStyle}>Deny refund</button>
          </div>}
          {finance && selected.refundDecision === 'APPROVED' && <button disabled={busy} onClick={() => void act(() => issueSupportRefund(selected.id))} style={{ ...primaryButtonStyle, marginTop: spacing.md }}>Issue approved refund</button>}
          {selected.refundDecision !== 'NONE' && <div style={{ marginTop: spacing.md, color: colors.textSecondary }}>Refund request: {selected.refundDecision} · {selected.refundId ?? 'not issued'}</div>}
        </>}
      </section>
    </div>
  </div>;
}

const panelStyle = { background: colors.canvas, border: `1px solid ${colors.line}`, borderRadius: radii.cardLarge, padding: spacing.lg, minWidth: 0 } as const;
const caseButtonStyle = (active: boolean) => ({ width: '100%', textAlign: 'left' as const, padding: spacing.md, marginBottom: spacing.xs, border: `1px solid ${active ? colors.brand : colors.line}`, borderRadius: radii.button, background: active ? colors.brandSoft : colors.canvas, color: colors.text, cursor: 'pointer' });
const messageStyle = { padding: spacing.md, borderRadius: radii.button, background: colors.desktop, color: colors.text } as const;
