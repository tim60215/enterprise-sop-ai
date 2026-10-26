import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // ========================================
    // 1. 確認目前登入者
    // ========================================

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "請先登入後再使用企業 SOP 助理。",
        },
        {
          status: 401,
        }
      );
    }

    // ========================================
    // 2. 取得使用者問題
    // ========================================

    const body = await request.json();

    const question =
      typeof body.question === "string"
        ? body.question.trim()
        : "";

    if (!question) {
      return NextResponse.json(
        {
          error: "請輸入問題",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================
    // 3. 判斷是否屬於安全 / 高風險確認
    // ========================================

    const safetyKeywords = [
      "禁忌",
      "抗凝血",
      "抗凝劑",
      "過敏",
      "出血",
      "懷孕",
      "孕婦",
      "劑量",
      "藥物",
      "安全",
      "可以打嗎",
      "能不能打",
      "可以注射嗎",
      "感染",
    ];

    const isSafetyCheck =
      safetyKeywords.some((keyword) =>
        question.includes(keyword)
      );

    // ========================================
    // 4. 確認 Vector Store
    // ========================================

    const vectorStoreId =
      process.env.OPENAI_VECTOR_STORE_ID;

    if (!vectorStoreId) {
      return NextResponse.json(
        {
          error:
            "系統尚未設定企業知識庫 Vector Store。",
        },
        {
          status: 500,
        }
      );
    }

    // ========================================
    // 5. 先把問題存進 Supabase
    // ========================================

    const {
      data: questionRecord,
      error: questionInsertError,
    } = await supabase
      .from("questions")
      .insert({
        user_id: user.id,
        question,
        is_safety_check: isSafetyCheck,
      })
      .select("id")
      .single();

    if (
      questionInsertError ||
      !questionRecord
    ) {
      console.error(
        "Question insert error:",
        questionInsertError
      );

      return NextResponse.json(
        {
          error: "問題紀錄失敗。",
        },
        {
          status: 500,
        }
      );
    }

    // ========================================
    // 6. 呼叫 OpenAI RAG
    // ========================================

    const response =
      await openai.responses.create({
        model: "gpt-5.6",

        instructions: `
你是企業內部 SOP 助理。

回答規則：

1. 使用繁體中文。
2. 公司制度、價格、流程、日期、SOP 等內容，必須依據企業知識庫。
3. 如果企業知識庫沒有足夠資料，請回答：
「目前企業知識庫中找不到足夠資訊回答這個問題。」
4. 禁止自行猜測或編造公司內部規定。
5. 如果有找到相關文件，直接根據文件內容回答。
6. 回答應簡潔、清楚，方便員工直接理解。
7. 不得把一般常識描述成公司的正式制度。
        `,

        input: question,

        tools: [
          {
            type: "file_search",
            vector_store_ids: [
              vectorStoreId,
            ],
            max_num_results: 5,
          },
        ],
      });

    const answer =
      response.output_text ||
      "目前企業知識庫中找不到足夠資訊回答這個問題。";

    // ========================================
    // 7. 找出實際引用來源
    // ========================================

    const sources = new Set<string>();

    for (const item of response.output ?? []) {
      if (item.type !== "message") {
        continue;
      }

      for (const content of item.content ?? []) {
        if (content.type !== "output_text") {
          continue;
        }

        for (
          const annotation of
          content.annotations ?? []
        ) {
          if (
            annotation.type ===
              "file_citation" &&
            annotation.filename
          ) {
            sources.add(
              annotation.filename
            );
          }
        }
      }
    }

    const sourceArray =
      Array.from(sources);

    // 有引用正式知識庫文件
    // 才視為 answerable
    const answerable =
      sourceArray.length > 0;

    // ========================================
    // 8. 更新問題是否可回答
    // ========================================

    const {
      error: questionUpdateError,
    } = await supabase
      .from("questions")
      .update({
        answerable,
      })
      .eq(
        "id",
        questionRecord.id
      );

    if (questionUpdateError) {
      console.error(
        "Question update error:",
        questionUpdateError
      );
    }

    // ========================================
    // 9. 重複問題分析
    // ========================================

    let repeatAnalysis: {
      repeatLevel:
        | "possible"
        | "likely"
        | "high";
      similarity: number;
      previousQuestion: string;
      daysSincePrevious: number;
      excludedFromScore: boolean;
      excludeReason: string | null;
    } | null = null;

    /*
      只有知識庫本身真的有答案，
      才判斷員工是不是重複詢問已知知識。

      如果知識庫自己都回答不了，
      就不應該把責任算到員工身上。
    */
    if (answerable) {
      try {
        // ----------------------------------------
        // 9-1. 將目前問題轉成 Embedding
        // ----------------------------------------

        const embeddingResponse =
          await openai.embeddings.create({
            model:
              "text-embedding-3-small",
            input: question,
            encoding_format: "float",
          });

        const currentEmbedding =
          embeddingResponse.data[0]
            .embedding;

        // ----------------------------------------
        // 9-2. 把 embedding 存進 questions
        // ----------------------------------------

        const {
          error:
            embeddingUpdateError,
        } = await supabase
          .from("questions")
          .update({
            embedding:
              currentEmbedding,
          })
          .eq(
            "id",
            questionRecord.id
          );

        if (embeddingUpdateError) {
          console.error(
            "Embedding update error:",
            embeddingUpdateError
          );
        }

        // ----------------------------------------
        // 9-3. 搜尋該員工以前最相似的問題
        // ----------------------------------------

        const {
          data: matches,
          error: matchError,
        } = await supabase.rpc(
          "match_previous_questions",
          {
            query_embedding:
              currentEmbedding,

            current_question_id:
              questionRecord.id,

            match_count: 5,
          }
        );

        if (matchError) {
          console.error(
            "Question matching error:",
            matchError
          );
        }

        // ----------------------------------------
        // 9-4. 取得最相似的一題
        // ----------------------------------------

        if (
          matches &&
          matches.length > 0
        ) {
          const bestMatch =
            matches[0];

          const similarity =
            Number(
              bestMatch.similarity_score
            );

          let repeatLevel:
            | "none"
            | "possible"
            | "likely"
            | "high" = "none";

          /*
            初始門檻。

            之後累積真實員工問題後，
            我們再依誤判率重新校準。
          */

          if (similarity >= 0.92) {
            repeatLevel = "high";
          } else if (
            similarity >= 0.86
          ) {
            repeatLevel = "likely";
          } else if (
            similarity >= 0.8
          ) {
            repeatLevel = "possible";
          }

          // ----------------------------------------
          // 9-5. 只有達到 possible 以上才紀錄
          // ----------------------------------------

          if (
            repeatLevel !== "none"
          ) {
            const previousDate =
              new Date(
                bestMatch.previous_created_at
              );

            const now =
              new Date();

            const daysSincePrevious =
              Math.max(
                0,
                Math.floor(
                  (now.getTime() -
                    previousDate.getTime()) /
                    (1000 *
                      60 *
                      60 *
                      24)
                )
              );

            // ----------------------------------------
            // 9-6. 判斷是否排除考核
            // ----------------------------------------

            const shouldExclude =
              daysSincePrevious ===
                0 ||
              isSafetyCheck;

            let excludeReason:
              | string
              | null = null;

            if (isSafetyCheck) {
              excludeReason =
                "病人安全或高風險確認，不列入學習扣分";
            } else if (
              daysSincePrevious ===
              0
            ) {
              excludeReason =
                "同一天重複提問，視為測試或即時確認";
            }

            // ----------------------------------------
            // 9-7. 寫入 repeat_events
            // ----------------------------------------

            const {
              error:
                repeatInsertError,
            } = await supabase
              .from(
                "repeat_events"
              )
              .insert({
                user_id:
                  user.id,

                current_question_id:
                  questionRecord.id,

                previous_question_id:
                  bestMatch.previous_question_id,

                similarity_score:
                  similarity,

                days_since_previous:
                  daysSincePrevious,

                repeat_level:
                  repeatLevel,

                excluded_from_score:
                  shouldExclude,

                exclude_reason:
                  excludeReason,
              });

            if (
              repeatInsertError
            ) {
              console.error(
                "Repeat event insert error:",
                repeatInsertError
              );
            }

            repeatAnalysis = {
              repeatLevel,
              similarity,

              previousQuestion:
                bestMatch.previous_question,

              daysSincePrevious,

              excludedFromScore:
                shouldExclude,

              excludeReason,
            };
          }
        }
      } catch (repeatError) {
        /*
          重複分析失敗，
          不能影響員工正常查 SOP。
        */

        console.error(
          "Repeat analysis error:",
          repeatError
        );
      }
    }

    // ========================================
    // 10. 把 AI 回答存進 answers
    // ========================================

    const {
      error: answerInsertError,
    } = await supabase
      .from("answers")
      .insert({
        question_id:
          questionRecord.id,

        answer,
      });

    if (answerInsertError) {
      console.error(
        "Answer insert error:",
        answerInsertError
      );
    }

    // ========================================
    // 11. 回傳結果給前端
    // ========================================

    return NextResponse.json({
      questionId:
        questionRecord.id,

      answer,

      sources:
        sourceArray,

      repeatAnalysis,
    });
  } catch (error) {
    console.error(
      "OpenAI / Supabase error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "AI 知識庫查詢失敗，請稍後再試。",
      },
      {
        status: 500,
      }
    );
  }
}