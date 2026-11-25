import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, EmptyState, Field, MenuRow, Screen, s } from '../../components';
import { useApp } from '../../hooks';
import { listHelpArticles, type HelpArticleView } from '../../api/help';
import { createSupportTicket, listSupportTickets, replyToSupportTicket, type SupportTicket } from '../../api/support';
import { describeApiError } from '../../api/describe-error';

export function HelpScreen({ inline = false }: { inline?: boolean }) {
  const app = useApp();
  const [articles, setArticles] = useState<HelpArticleView[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [orderId, setOrderId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setStatus('loading');
    try {
      const [help, cases] = await Promise.all([listHelpArticles(), listSupportTickets()]);
      setArticles(help.items);
      setTickets(cases);
      setStatus('ready');
      setError('');
    } catch (err) {
      setError(describeApiError(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const byCategory = articles.reduce<Record<string, HelpArticleView[]>>((acc, article) => {
    (acc[article.category] ??= []).push(article);
    return acc;
  }, {});

  const submit = async () => {
    if (!subject.trim() || !message.trim()) return;
    const amountText = refundAmount.trim();
    const amountMatch = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amountText);
    if ((amountText || refundReason.trim()) && (!orderId.trim() || !amountMatch || !refundReason.trim())) {
      app.toast('A refund request needs an order ID, amount, and reason.');
      return;
    }
    const amountMinor = amountMatch
      ? Number(amountMatch[1]) * 100 + Number((amountMatch[2] ?? '').padEnd(2, '0'))
      : undefined;
    if (amountMinor !== undefined && !Number.isSafeInteger(amountMinor)) {
      app.toast('The refund amount is too large.');
      return;
    }
    setBusy(true);
    try {
      await createSupportTicket({
        subject: subject.trim(), body: message.trim(),
        ...(orderId.trim() ? { orderId: orderId.trim() } : {}),
        ...(amountMinor !== undefined ? { requestedRefundAmount: amountMinor, refundReason: refundReason.trim() } : {}),
      });
      setSubject(''); setMessage(''); setOrderId(''); setRefundAmount(''); setRefundReason('');
      await reload();
      app.toast('Your support request was sent.');
    } catch (err) { app.toast(describeApiError(err)); }
    finally { setBusy(false); }
  };

  const sendReply = async (ticketId: string) => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await replyToSupportTicket(ticketId, reply.trim());
      setReply('');
      await reload();
    } catch (err) { app.toast(describeApiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <Screen title="Help & support" onBack={inline ? undefined : app.back}>
      <AppText size={24} bold>We’re here to help.</AppText>
      <AppText bold style={{ marginTop: 20 }}>Contact support</AppText>
      <Field label="Subject" value={subject} onChange={setSubject} maxLength={160} />
      <Field label="Your message" value={message} onChange={setMessage} multiline maxLength={5000} />
      <AppText muted>For an order refund request, include its order ID, amount, and reason.</AppText>
      <Field label="Order ID (for an order request)" value={orderId} onChange={setOrderId} />
      <Field label="Refund amount" value={refundAmount} onChange={setRefundAmount} keyboardType="numeric" placeholder="0.00" />
      <Field label="Refund reason" value={refundReason} onChange={setRefundReason} multiline maxLength={1000} />
      <Button label="Send support request" onPress={() => void submit()} disabled={busy || !subject.trim() || !message.trim()} loading={busy} />

      <AppText bold style={{ marginTop: 24 }}>Your support requests</AppText>
      {status === 'loading' ? <AppText muted>Loading…</AppText> : null}
      {status === 'error' ? <EmptyState title="Couldn't load support requests" detail={error} /> : null}
      {status === 'ready' && tickets.length === 0 ? <AppText muted>No support requests yet.</AppText> : null}
      {tickets.map((ticket) => (
        <View key={ticket.id} style={[s.card, { gap: 8 }]}>
          <MenuRow title={ticket.subject} detail={`${ticket.status.replaceAll('_', ' ')} · ${ticket.refundDecision}`} onPress={() => setOpenId(openId === ticket.id ? null : ticket.id)} />
          {openId === ticket.id ? <>
            {ticket.messages.map((item) => <AppText key={item.id}>{item.body}</AppText>)}
            <Field label="Reply" value={reply} onChange={setReply} multiline maxLength={5000} />
            <Button label="Send reply" secondary onPress={() => void sendReply(ticket.id)} disabled={busy || !reply.trim()} loading={busy} />
          </> : null}
        </View>
      ))}

      <AppText bold style={{ marginTop: 24 }}>Help articles</AppText>
      {status === 'ready' && articles.length === 0 ? <AppText muted>No help articles yet. Check back soon.</AppText> : null}
      {Object.entries(byCategory).map(([category, rows]) => (
        <React.Fragment key={category}>
          <AppText bold size={13} style={{ marginTop: 12, marginBottom: 4 }}>{category}</AppText>
          {rows.map((article) => <React.Fragment key={article.id}>
            <MenuRow title={article.title} onPress={() => setOpenId(openId === article.id ? null : article.id)} />
            {openId === article.id ? <AppText muted>{article.body}</AppText> : null}
          </React.Fragment>)}
        </React.Fragment>
      ))}
    </Screen>
  );
}
