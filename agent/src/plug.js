/**
 * Tomada inteligente via HTTP genérico. Exemplos de config.json:
 *
 * Tasmota:
 *  "plug": { "on": {"url":"http://192.168.0.50/cm?cmnd=Power%20On"},
 *            "off":{"url":"http://192.168.0.50/cm?cmnd=Power%20Off"} }
 * Home Assistant (webhook):
 *  "plug": { "on": {"url":"http://ha.local:8123/api/webhook/pc_on","method":"POST"}, ... }
 *
 * Tuya/Smart Life: use via Home Assistant (integração Tuya) ou Local Tuya e
 * chame o webhook acima — assina requests na nuvem Tuya não cabe num agent leve.
 */
export async function plugSwitch(plugCfg, state) {
  const target = plugCfg?.[state];
  if (!target?.url) throw new Error(`plug.${state}.url não configurado`);
  const res = await fetch(target.url, {
    method: target.method || 'GET',
    headers: target.headers,
    body: target.body ? JSON.stringify(target.body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`tomada respondeu HTTP ${res.status}`);
}
