export function bookingConfirmationEmail(params: {
  clientName: string;
  providerName: string;
  serviceName: string;
  dateTime: string;
  amount: number;
}) {
  return {
    subject: `Booking confirmed — ${params.serviceName} with ${params.providerName}`,
    htmlContent: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>You're booked, ${params.clientName} 🎉</h2>
        <p><strong>${params.serviceName}</strong> with ${params.providerName}</p>
        <p>${params.dateTime}</p>
        <p>Amount: RM ${params.amount.toFixed(2)}</p>
        <p>We'll remind you closer to the date. Questions? Just reply to this email.</p>
      </div>
    `,
  };
}

export function bookingReminderEmail(params: {
  clientName: string;
  providerName: string;
  dateTime: string;
}) {
  return {
    subject: `Reminder: your appointment with ${params.providerName} is coming up`,
    htmlContent: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>See you soon, ${params.clientName}</h2>
        <p>Your appointment with ${params.providerName} is on ${params.dateTime}.</p>
      </div>
    `,
  };
}
