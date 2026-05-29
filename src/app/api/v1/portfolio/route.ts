import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { getStockPrice } from '@/lib/kis';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  const [profileRes, holdingsRes] = await Promise.all([
    supabaseAdmin
      .from('user_profiles')
      .select('cash')
      .eq('id', auth.userId)
      .single(),
    supabaseAdmin
      .from('holdings')
      .select('code, quantity, average_price, stocks ( name )')
      .eq('user_id', auth.userId),
  ]);

  if (profileRes.error || !profileRes.data) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '포트폴리오 조회 실패' } },
      { status: 500 },
    );
  }

  const cash = profileRes.data.cash;

  type HoldingRow = {
    code: string;
    quantity: number;
    average_price: number;
    stocks: { name: string } | null;
  };

  const holdingRows = (holdingsRes.data ?? []) as unknown as HoldingRow[];

  const priceResults = await Promise.allSettled(
    holdingRows.map((h) => getStockPrice(h.code)),
  );

  const holdings = holdingRows.map((h, i) => {
    const settled = priceResults[i];
    const currentPrice =
      settled.status === 'fulfilled'
        ? settled.value.currentPrice
        : h.average_price;
    return {
      code: h.code,
      name: h.stocks?.name ?? h.code,
      quantity: h.quantity,
      averagePrice: h.average_price,
      currentPrice,
    };
  });

  const stockValue = holdings.reduce(
    (sum, h) => sum + h.currentPrice * h.quantity,
    0,
  );
  const totalAssets = cash + stockValue;

  const hasPriceFailure =
    holdingRows.length > 0 && priceResults.some((r) => r.status === 'rejected');

  const today = new Date().toISOString().slice(0, 10);
  if (!hasPriceFailure) {
    await supabaseAdmin
      .from('asset_history')
      .upsert(
        {
          user_id: auth.userId,
          snapshot_date: today,
          total_value: totalAssets,
        },
        { onConflict: 'user_id,snapshot_date' },
      );
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const { data: prevHistory } = await supabaseAdmin
    .from('asset_history')
    .select('total_value')
    .eq('user_id', auth.userId)
    .lte('snapshot_date', yesterday.toISOString().slice(0, 10))
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  const prevValue = prevHistory?.total_value ?? totalAssets;
  const dailyReturnAmt = totalAssets - prevValue;
  const dailyReturnRate =
    prevValue > 0 ? (dailyReturnAmt / prevValue) * 100 : 0;

  return NextResponse.json({
    totalAssets,
    cash,
    stockValue,
    dailyReturnRate: parseFloat(dailyReturnRate.toFixed(2)),
    dailyReturnAmt,
    holdings,
    allocation: [
      { name: '예수금', value: cash },
      ...holdings.map((h) => ({
        name: h.name,
        value: h.currentPrice * h.quantity,
      })),
    ],
  });
}
