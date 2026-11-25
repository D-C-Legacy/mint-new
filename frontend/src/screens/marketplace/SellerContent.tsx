import * as tokens from "../../theme";
import { colors as c } from "../../theme";
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText, Button, Chips, EmptyState, Field } from "../../components";
import type { CardProduct } from "../../api/catalog";
import type { ChannelSummary } from "../../api/channels";
import type { ReviewView } from "../../api/reviews";
import { createReport } from "../../api/reports";
import { describeApiError } from "../../api/describe-error";
import { ProductGrid } from "./shared";

// Inline report form for one review (28-29 Oct 2026 Apple review punch list, item 2) — same
// "expand in place, no modal" pattern AccountScreen.tsx's own inline rows use, not a Sheet, since
// this is a plain scrollable list, not a floating video overlay like the live chat's own report
// flow (LiveReel.tsx/LiveReelDesktop.tsx).
export function ReportReview({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <AppText size={12} muted>
        Report submitted.
      </AppText>
    );
  }

  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
        <AppText size={12} style={{ color: c.textSecondary }}>
          Report
        </AppText>
      </Pressable>
    );
  }

  return (
    <View style={{ gap: tokens.spacing.sm, marginTop: 4 }}>
      <Field
        label="Why are you reporting this review?"
        value={reason}
        onChange={setReason}
        multiline
        error={error}
      />
      <Button
        label="Submit"
        loading={busy}
        disabled={!reason.trim()}
        onPress={async () => {
          setBusy(true);
          setError("");
          try {
            await createReport({ targetType: "REVIEW", targetId: reviewId, reason: reason.trim() });
            setDone(true);
          } catch (err) {
            setError(describeApiError(err));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button secondary label="Cancel" disabled={busy} onPress={() => setOpen(false)} />
    </View>
  );
}

// The tabbed part of a seller's public page (Shop grid / Reviews / About), shared by the mobile
// layout and the desktop 2-column layout.
export function SellerContent({
  tab,
  onTab,
  cards,
  reviews,
  channel,
}: {
  tab: string;
  onTab: (tab: string) => void;
  cards: CardProduct[];
  reviews: ReviewView[];
  channel: ChannelSummary;
}) {
  return (
    <>
      <Chips items={["Shop", "Reviews", "About"]} value={tab} onChange={onTab} />
      {tab === "Shop" ? (
        <ProductGrid items={cards} />
      ) : tab === "Reviews" ? (
        reviews.length === 0 ? (
          <EmptyState title="No reviews yet" detail="Reviews show up here once buyers leave them." />
        ) : (
          <View style={{ gap: tokens.spacing.md }}>
            {reviews.map((review) => (
              <View
                key={review.id}
                style={{ gap: 4, paddingVertical: tokens.spacing.md, borderBottomWidth: 1, borderColor: c.line }}
              >
                <AppText bold>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</AppText>
                {review.body ? <AppText>{review.body}</AppText> : null}
                <AppText muted size={11}>
                  {new Date(review.createdAt).toLocaleDateString()}
                </AppText>
                {review.sellerResponseBody ? (
                  <View style={{ marginTop: 6, paddingLeft: tokens.spacing.md, borderLeftWidth: 2, borderColor: c.line }}>
                    <AppText muted size={12} bold>
                      Seller response
                    </AppText>
                    <AppText size={13}>{review.sellerResponseBody}</AppText>
                  </View>
                ) : null}
                <ReportReview reviewId={review.id} />
              </View>
            ))}
          </View>
        )
      ) : (
        <View style={{ gap: tokens.spacing.md }}>
          <AppText>{channel.bio ?? "This seller has not written a bio yet."}</AppText>
          <AppText muted>Joined {new Date(channel.createdAt).toLocaleDateString()}</AppText>
        </View>
      )}
    </>
  );
}
