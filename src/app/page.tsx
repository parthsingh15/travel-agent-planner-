import Link from "next/link";
import { Plane, Sparkles, Shield, Map, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2 font-bold text-primary-600 text-xl">
            <Plane className="h-7 w-7" />
            Travel Planner — India
          </div>
          <div className="flex gap-3">
            <Link href="/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-full text-sm font-medium mb-6">
          <Sparkles className="h-4 w-4" />
          AI-Powered Multi-Agent Planning
        </div>
        <h1 className="text-5xl font-bold text-slate-900 mb-6 leading-tight">
          Plan a day-by-day itinerary for your India trip
        </h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-10">
          Research places to visit, plan stays and transport, and review estimated costs against your budget. Save your itinerary and reopen it from My Trips.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/signup">
            <Button size="lg">Start Planning</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">Sign In</Button>
          </Link>
        </div>
        <p className="text-center text-sm text-slate-500 mt-6">
          Create a trip → Generate an itinerary → Review costs → Save to My Trips
        </p>
      </section>

      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Map,
                title: "Create Your Trip",
                description: "Set destination, dates, budget, and travel preferences.",
              },
              {
                icon: Sparkles,
                title: "AI Agents Collaborate",
                description: "The planning pipeline researches places, builds a daily schedule, and checks the estimated costs.",
              },
              {
                icon: MessageSquare,
                title: "Chat & Customize",
                description: "Use the AI assistant to refine your itinerary in real-time.",
              },
            ].map((feature) => (
              <div key={feature.title} className="text-center p-6">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary-100 text-primary-600 rounded-xl mb-4">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">Our AI Agent Team</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              "Destination Research Agent",
              "Flight Agent",
              "Hotel Agent",
              "Activity Agent",
              "Restaurant Agent",
              "Transportation Agent",
              "Budget Agent",
              "Itinerary Planner Agent",
              "Itinerary Critic & Validator",
              "Supervisor Agent",
            ].map((agent) => (
              <div
                key={agent}
                className="bg-white border border-slate-200 rounded-lg p-4 text-center text-sm font-medium"
              >
                {agent}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-slate-900 text-slate-400 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="h-4 w-4" />
            Secure authentication, hashed passwords, and complete trip history
          </div>
          <p>&copy; 2026 Travel Planner. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
