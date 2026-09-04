// Função serverless do Netlify (formato novo, streaming) — roda no servidor, não no
// navegador do visitante. A chave de API fica só aqui, lida de uma variável de
// ambiente — nunca é enviada pro código do site.
//
// Configure em: Netlify → Project configuration → Environment variables
//   Nome:  ANTHROPIC_API_KEY
//   Valor: sua chave começando com sk-ant-...
//
// Por que streaming? Funções "compradas" (buffer, tudo de uma vez no final) do
// Netlify têm um teto de 30s de execução. Roteiros longos (7-8min de narração)
// podem passar disso. Funções que devolvem a resposta em streaming (por partes,
// continuamente) têm um teto maior, de 60s — por isso retransmitimos a resposta
// da Anthropic direto pro navegador à medida que ela é gerada, em vez de esperar
// tudo terminar aqui no servidor pra só então responder.

const ROTEIRO_TOOL = {
  name: "salvar_roteiro",
  description: "Salva o roteiro de vídeo gerado, já estruturado em campos.",
  input_schema: {
    type: "object",
    properties: {
      gancho: {
        type: "string",
        description: "As 2-3 primeiras frases do roteiro, com tensão/pergunta/promessa nos primeiros segundos.",
      },
      roteiro: {
        type: "string",
        description:
          "Roteiro completo, em 10 a 14 parágrafos, com o enquadramento de direita, pronto para narração. Precisa render aproximadamente 7 a 8 minutos falado (cerca de 1000 a 1200 palavras somando gancho + roteiro + encerramento, a ~150 palavras/minuto). Desenvolva contexto, antecedentes do tema, diferentes ângulos da mesma linha editorial e implicações — sem inventar fatos, números, datas ou falas específicas que não estejam no resumo da notícia ou no conhecimento público amplamente estabelecido.",
      },
      encerramento: {
        type: "string",
        description:
          "Fechamento do roteiro, 1 parágrafo curto, retomando o tema específico do vídeo antes de convidar a se inscrever no canal, ativar o sininho e comentar a opinião sobre o assunto — sem soar genérico.",
      },
      titulos: {
        type: "array",
        items: { type: "string" },
        description: "3 opções de título para o YouTube, cada uma com até 70 caracteres.",
      },
      descricao_seo: {
        type: "string",
        description: "Descrição de até 4 linhas para o YouTube, com a palavra-chave principal nas primeiras 150 caracteres.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "12 a 18 tags curtas para o YouTube, sem #.",
      },
    },
    required: ["gancho", "roteiro", "encerramento", "titulos", "descricao_seo", "tags"],
  },
};

export default async (req) => {
  const jsonHeaders = { "content-type": "application/json" };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: jsonHeaders });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY não configurada nas variáveis de ambiente do Netlify." }),
      { status: 500, headers: jsonHeaders }
    );
  }

  let payload;
  try {
    payload = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Corpo da requisição inválido." }), { status: 400, headers: jsonHeaders });
  }

  const { title, source, category, summary } = payload;
  if (!title) {
    return new Response(JSON.stringify({ error: "Faltou o título da notícia." }), { status: 400, headers: jsonHeaders });
  }

  const prompt = `Você é roteirista de um canal de YouTube de política brasileira. O canal tem linha editorial genuinamente de direita/conservadora — não neutra. Ao narrar o fato, adote o ponto de vista, o enquadramento e as ênfases que um comentarista de direita brasileiro real usaria (crítica a excessos do STF, defesa de liberdades individuais, ceticismo em relação a pautas identificadas com a esquerda, valorização de família e livre mercado quando pertinente ao tema) — sem inventar fatos que não estejam na notícia, apenas o enquadramento e o tom devem refletir esse ponto de vista.

Notícia:
Título: "${title}"
Fonte: ${source || "desconhecida"}
Categoria: ${category || "Geral"}
Resumo: ${summary || title}

Meta de duração: o roteiro completo (gancho + corpo + encerramento) precisa render entre 7 e 8 minutos de narração — em torno de 1000 a 1200 palavras no total, a um ritmo de fala natural de ~150 palavras por minuto. Como o resumo da notícia é curto, ganhe esse tempo desenvolvendo contexto (antecedentes do tema, como isso se encaixa no cenário político mais amplo), explicando implicações, e reforçando o enquadramento de direita sob diferentes ângulos — não inventando fatos, números, datas ou falas específicas que não estejam no resumo ou no conhecimento público já estabelecido sobre o tema.

Use a ferramenta "salvar_roteiro" para entregar o resultado, preenchendo todos os campos.`;

  let anthropicResp;
  try {
    anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4500,
        stream: true,
        tools: [ROTEIRO_TOOL],
        tool_choice: { type: "tool", name: "salvar_roteiro" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `Falha ao contatar a API: ${String(e)}` }), { status: 502, headers: jsonHeaders });
  }

  if (!anthropicResp.ok || !anthropicResp.body) {
    const errText = await anthropicResp.text().catch(() => "");
    return new Response(JSON.stringify({ error: errText || `Erro HTTP ${anthropicResp.status}` }), {
      status: anthropicResp.status || 502,
      headers: jsonHeaders,
    });
  }

  // Retransmite o stream de eventos (SSE) da Anthropic direto pro navegador,
  // sem esperar terminar aqui — o front-end acumula os pedaços e monta o
  // resultado final. Isso mantém a conexão continuamente ativa, o que evita
  // o teto de função "comprada" e usa o teto maior de função em streaming.
  return new Response(anthropicResp.body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
};
