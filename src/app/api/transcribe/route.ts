import axios from "axios";
import { NextRequest, NextResponse } from "next/server";
import fetch from 'node-fetch';
import ollama from 'ollama';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const history = JSON.parse(formData.get('history') as string);
        const prePrompt = `You are an AI interviewer conducting a one-on-one mock interview. Ask only one question at a time. After the candidate answers, wait for their response before asking the next question.

Do NOT ask follow-up questions until the candidate responds. Do NOT include multiple questions in a single reply.

Interview areas may include:
- Behavioral questions
- System design
- Data structures & algorithms
- Problem-solving

Maintain a friendly, professional tone. Begin with a soft opener like "Can you tell me about yourself?" and gradually increase difficulty. Always wait for input before continuing and do not get diverted from the topic
`;



        if (history!.length == 0) {
            history.push({
                role: "assistant",
                content: prePrompt
            })
        }
        // console.log("hisotry is ", history);


        const Whisper_res = await axios.post('http://localhost:8000/transcribe', formData)
        // res.data.text contains the transciption
        console.log(Whisper_res.data.text);

        const encoder = new TextEncoder();

        // See the articles.md for More Info about Streams
        const streamBody = new ReadableStream({
            async start(controller) {
                try {
                    controller.enqueue(encoder.encode(`user: ${JSON.stringify(Whisper_res.data.text)}`))
                    const chatRes = await ollama.chat({
                        model: 'mistral',
                        messages: [
                            ...history,
                            {
                                role: "user",
                                content: Whisper_res.data.text
                            }
                        ],
                        stream: true
                    })

                    // ChatRes is also a stream so we can use for..await..of loop

                    for await (const chunk of chatRes) {
                        // chunk is an object : {..., message : {content : "sample" } ,,,}
                        const payload = `assistant: ${JSON.stringify(chunk)}\n\n`;
                        controller.enqueue(encoder.encode(payload));
                    }

                    controller.close();

                } catch (error) {
                    controller.enqueue(encoder.encode(`assistant: ${JSON.stringify({ error: "Stream error" })}\n\n`));
                    controller.close();
                }
            }
        })

        return new NextResponse(streamBody, {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        })

    } catch (error) {
        console.log(error);
        // the bewlow .json() method Stringifies the JSON and automatically add the headers "Content-Type": "application/json"
        return Response.json({
            text: "Error in transciption"
        }, {
            status : 500
        })

        // You can use the below thing with new Constructor but then you have to manually Stringify the JSON object and app headers : 
        // return new Response(JSON.stringify({ text: "Hello, world!" }), {
        //     status: 200,
        //     headers: {
        //         "Content-Type": "application/json"
        //     }
        // });
    }
}