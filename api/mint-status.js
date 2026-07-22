export default function handler(req, res) {
  res.status(200).json({ mintOpen: !!process.env.MINT_OPEN });
}
