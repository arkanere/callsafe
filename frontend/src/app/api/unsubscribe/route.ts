import { NextResponse, type NextRequest } from 'next/server';
import { unsubscribeEmail } from '$lib/server/unsubscribe-service';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
	try {
		const { email } = await request.json();

		const result = await unsubscribeEmail({ email });
		return NextResponse.json(result.body, { status: result.status });
	} catch (error) {
		console.error('Error processing unsubscribe request:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to process unsubscription request'
			},
			{ status: 500 }
		);
	}
}
