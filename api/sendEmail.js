export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, tierTitle, tierBadge, chain, txHash, nftImage } = req.body;
  if (!email || !tierTitle) return res.status(400).json({ error: 'Missing fields' });

  // Build explorer URL based on chain
  const getExplorerUrl = (chain, hash) => {
    if (!hash) return null;
    const c = chain?.toLowerCase();
    if (c?.includes('solana')) return `https://explorer.solana.com/tx/${hash}?cluster=devnet`;
    if (c?.includes('ethereum')) return `https://etherscan.io/tx/${hash}`;
    if (c?.includes('polygon')) return `https://polygonscan.com/tx/${hash}`;
    return null;
  };

  const explorerUrl = getExplorerUrl(chain, txHash);

  const txLine = txHash ? `
    <p style="margin:8px 0;color:#888">Transaction: 
      ${explorerUrl 
        ? `<a href="${explorerUrl}" style="color:#00e5ff;text-decoration:none" target="_blank">${txHash.slice(0,24)}...${txHash.slice(-8)} 🔗</a>`
        : `<span style="color:#00e5ff">${txHash.slice(0,24)}...${txHash.slice(-8)}</span>`
      }
    </p>` 
  : '';

  const imageLine = nftImage ? `
    <div style="text-align:center;margin-bottom:24px">
      <img src="${nftImage}" alt="Your OASIS Founder NFT" 
        style="max-width:280px;width:100%;border-radius:12px;border:1px solid #00e5ff44" />
    </div>`
  : '';

  try {
    const res2 = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: `🌀 Your OASIS Founder NFT is confirmed — ${tierBadge}`,
        html: `
          <div style="background:#01040f;color:#e0e0e0;font-family:sans-serif;padding:40px;max-width:560px;margin:0 auto;border-radius:16px;border:1px solid #00e5ff22">
            <h1 style="color:#00e5ff;margin:0 0 8px">MINT SUCCESSFUL</h1>
            <p style="color:#888;margin:0 0 24px">Welcome to the OASIS, Founder.</p>
            ${imageLine}
            <div style="background:#0a0f2a;border-radius:12px;padding:24px;margin-bottom:24px">
              <p style="margin:0 0 8px;font-size:18px">${tierBadge} <strong>${tierTitle}</strong></p>
              <p style="margin:8px 0;color:#888">Chain: ${chain}</p>
              ${txLine}
              ${explorerUrl ? `<a href="${explorerUrl}" style="display:inline-block;margin-top:12px;padding:8px 16px;background:#00e5ff11;border:1px solid #00e5ff44;border-radius:8px;color:#00e5ff;text-decoration:none;font-size:13px">View on Explorer →</a>` : ''}
            </div>
            <p style="color:#666;font-size:13px">Your NFT grants you Founder access to the OASIS. It should appear in your wallet shortly.</p>
            <p style="color:#666;font-size:13px">Questions? Contact us on our telegram group: <a href="https://t.me/oasisweb4chat">https://t.me/oasisweb4chat</a></p>
            <hr style="border:none;border-top:1px solid #ffffff11;margin:24px 0">
            <p style="color:#444;font-size:11px;margin:0">OASIS · Founder Access Program</p>
          </div>
        `
      })
    });

    if (!res2.ok) {
      const err = await res2.text();
      throw new Error(`Resend error: ${err}`);
    }

    return res.status(200).json({ success: true });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}