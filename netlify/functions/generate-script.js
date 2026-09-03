// Função serverless (roda no servidor do Netlify, não no navegador do visitante).
// A chave de API fica só aqui, lida de uma variável de ambiente — nunca é
// enviada pro código do site, então visitantes não conseguem roubá-la.
//
// Configure em: Netlify → Project configuration → Environment variables
//   Nome:  ANTHROPIC_API_KEY
//   Valor: sua chave começando com sk-ant-...
//
// Usa "tool use" da API da Anthropic em vez de pedir texto solto e tentar
// converter pra JSON depois: a API valida e estrutura o retorno pela gente,
// então nunca mais quebra por causa de aspas ou quebra de linha dentro do texto.

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
        description: "Roteiro completo em 4-6 parágrafos curtos, com o enquadramento de direita, pronto para narração.",
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

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método não permitido" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY não configurada nas variáveis de ambiente do Netlify." }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Corpo da requisição inválido." }) };
  }

  const { title, source, category, summary } = payload;
  if (!title) {
    return { statusCode: 400, body: JSON.stringify({ error: "Faltou o título da notícia." }) };
  }

  const prompt = `Você é roteirista de um canal de YouTube de política brasileira. O canal tem linha editorial genuinamente de direita/conservadora — não neutra. Ao narrar o fato, adote o ponto de vista, o enquadramento e as ênfases que um comentarista de direita brasileiro real usaria (crítica a excessos do STF, defesa de liberdades individuais, ceticismo em relação a pautas identificadas com a esquerda, valorização de família e livre mercado quando pertinente ao tema) — sem inventar fatos que não estejam na notícia, apenas o enquadramento e o tom devem refletir esse ponto de vista.

Notícia:
Título: "${title}"
Fonte: ${source || "desconhecida"}
Categoria: ${category || "Geral"}
Resumo: ${summary || title}

Use a ferramenta "salvar_roteiro" para entregar o resultado, preenchendo todos os campos.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // Modelo bom custo-benefício pra esse tipo de texto. Pra economizar
        // ainda mais, troque por "claude-haiku-4-5-20251001".
        model: "claude-sonnet-5",
        max_tokens: 1400,
        tools: [ROTEIRO_TOOL],
        tool_choice: { type: "tool", name: "salvar_roteiro" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro da API Anthropic:", JSON.stringify(data));
      return { statusCode: response.status, body: JSON.stringify({ error: data }) };
    }

    const toolUse = (data.content || []).find((b) => b.type === "tool_use" && b.name === "salvar_roteiro");
    if (!toolUse || !toolUse.input) {
      console.error("Resposta sem tool_use esperado:", JSON.stringify(data));
      return { statusCode: 502, body: JSON.stringify({ error: "A IA não devolveu o roteiro estruturado.", raw: JSON.stringify(data) }) };
    }

    // toolUse.input já vem como objeto JS pronto, validado pela própria API —
    // sem precisar interpretar texto solto nem arriscar quebrar em aspas/quebras de linha.
    return { statusCode: 200, body: JSON.stringify(toolUse.input) };
  } catch (e) {
    console.error("Erro inesperado na função generate-script:", e);
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
}
