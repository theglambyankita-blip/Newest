import { Router } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, bookings } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/my-bookings", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const email =
      user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress ||
      user.emailAddresses[0]?.emailAddress;

    if (!email) {
      res.json({ bookings: [] });
      return;
    }

    const userBookings = await db
      .select()
      .from(bookings)
      .where(eq(bookings.clientEmail, email))
      .orderBy(desc(bookings.createdAt));

    res.json({ bookings: userBookings, email });
  } catch (e) {
    console.error("my-bookings error:", e);
    res.status(500).json({ error: "Failed to fetch bookings." });
  }
});

export default router;
