import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Instagram, Mail, Star, Sparkles, Wand2, PartyPopper, GraduationCap, Users, Image as ImageIcon, Music } from "lucide-react";

export function AfterDark() {
  return (
    <div className="min-h-screen bg-[#0d0a07] text-[#fcf9f2] selection:bg-[#d4af37] selection:text-black font-nunito flex flex-col w-full overflow-x-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Nunito:wght@300;400;600;700&display=swap');
        
        .font-cormorant {
          font-family: 'Cormorant Garamond', serif;
        }
        .font-nunito {
          font-family: 'Nunito', sans-serif;
        }

        .gold-gradient-text {
          background: linear-gradient(to right, #f9f2d4, #d4af37, #aa8627);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .gold-gradient-bg {
          background: linear-gradient(135deg, #e8d082, #d4af37, #99781f);
        }

        .gold-glow:hover {
          box-shadow: 0 0 20px rgba(212, 175, 55, 0.15), inset 0 0 1px rgba(212, 175, 55, 0.5);
          border-color: rgba(212, 175, 55, 0.4);
        }

        .nav-blur {
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
      `}} />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 nav-blur bg-[#0d0a07]/80 border-b border-[#d4af37]/20">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="font-cormorant text-2xl tracking-widest gold-gradient-text font-semibold uppercase">
            The Glam by Ankita
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm uppercase tracking-widest text-[#d4af37]/80">
            <a href="#services" className="hover:text-[#d4af37] transition-colors">Services</a>
            <a href="#about" className="hover:text-[#d4af37] transition-colors">About</a>
            <a href="#portfolio" className="hover:text-[#d4af37] transition-colors">Portfolio</a>
          </div>
          <Button className="gold-gradient-bg text-black hover:opacity-90 font-semibold tracking-wider uppercase text-xs rounded-none px-6">
            Book Now
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center pt-20">
        <div className="absolute inset-0 z-0">
          <img 
            src="/__mockup/images/glam-dark-hero.png" 
            alt="Moody beauty editorial" 
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0a07] via-[#0d0a07]/50 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0d0a07] via-[#0d0a07]/80 to-transparent"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 w-full flex flex-col md:flex-row items-center">
          <div className="w-full md:w-1/2 space-y-8 pr-0 md:pr-12">
            <div className="inline-flex items-center gap-3">
              <span className="w-12 h-[1px] bg-[#d4af37]"></span>
              <span className="uppercase tracking-[0.2em] text-[#d4af37] text-xs font-semibold">Melbourne Makeup Artist</span>
            </div>
            
            <h1 className="font-cormorant text-6xl md:text-8xl leading-[1.1] text-white">
              Beauty That <br/>
              <span className="gold-gradient-text italic">Tells Your Story</span>
            </h1>
            
            <p className="text-lg text-white/70 max-w-lg font-light leading-relaxed">
              Professional makeup artistry tailored to you — from soft everyday glam to full bridal transformations.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button className="gold-gradient-bg text-black hover:opacity-90 font-semibold tracking-wider uppercase h-14 px-8 rounded-none text-sm">
                Book Appointment
              </Button>
              <Button variant="outline" className="border-[#d4af37] text-[#d4af37] hover:bg-[#d4af37]/10 tracking-wider uppercase h-14 px-8 rounded-none text-sm bg-transparent">
                View Portfolio
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-24 relative">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center space-y-4 mb-16">
            <div className="inline-flex items-center gap-3 justify-center w-full">
              <span className="w-8 h-[1px] bg-[#d4af37]/50"></span>
              <span className="uppercase tracking-[0.2em] text-[#d4af37] text-xs">What I Offer</span>
              <span className="w-8 h-[1px] bg-[#d4af37]/50"></span>
            </div>
            <h2 className="font-cormorant text-4xl md:text-5xl text-white">Services & Specialties</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: <Wand2 className="w-6 h-6" />, title: "Soft Glam", price: "$100", desc: "Enhance your natural beauty with a soft, flawless finish." },
              { icon: <Sparkles className="w-6 h-6" />, title: "Full Glam", price: "$120", desc: "A full coverage, dramatic look that turns heads." },
              { icon: <PartyPopper className="w-6 h-6" />, title: "Party Glam", price: "$120", desc: "Perfect for a night out or special celebration." },
              { icon: <GraduationCap className="w-6 h-6" />, title: "Formal Makeup", price: "$120", desc: "Look your absolute best for your special event." },
              { icon: <Star className="w-6 h-6" />, title: "Bridal Makeup", price: "$180", desc: "Long-lasting perfection for your big day." },
              { icon: <Users className="w-6 h-6" />, title: "Bridal Party", price: "$120 pp", desc: "Cohesive looks for your entire bridal party." },
              { icon: <ImageIcon className="w-6 h-6" />, title: "Editorial", price: "From $140", desc: "Creative, high-fashion looks for photoshoots." },
              { icon: <Music className="w-6 h-6" />, title: "Festival", price: "From $120", desc: "Bold, creative looks for festivals and events." },
            ].map((service, i) => (
              <Card key={i} className="bg-[#1a1410] border-[#d4af37]/20 rounded-none gold-glow transition-all duration-300 group overflow-hidden">
                <CardContent className="p-8 space-y-6 relative">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-[#d4af37]/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                  <div className="text-[#d4af37] opacity-80 group-hover:opacity-100 transition-opacity">
                    {service.icon}
                  </div>
                  <div>
                    <h3 className="font-cormorant text-2xl text-white mb-2">{service.title}</h3>
                    <p className="text-[#d4af37] font-semibold tracking-wider text-sm">{service.price}</p>
                  </div>
                  <p className="text-white/60 text-sm font-light leading-relaxed">
                    {service.desc}
                  </p>
                  <div className="pt-4 flex items-center text-xs uppercase tracking-widest text-[#d4af37] opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0 cursor-pointer">
                    Book Now <ArrowRight className="w-3 h-3 ml-2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-24 bg-[#0a0806] border-y border-[#d4af37]/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="w-full lg:w-1/2 space-y-8 order-2 lg:order-1">
              <div className="inline-flex items-center gap-3">
                <span className="uppercase tracking-[0.2em] text-[#d4af37] text-xs">About Ankita</span>
                <span className="w-12 h-[1px] bg-[#d4af37]/50"></span>
              </div>
              
              <h2 className="font-cormorant text-4xl md:text-6xl text-white">The Artist <br/><span className="italic text-white/50">Behind the Brush</span></h2>
              
              <p className="text-lg text-white/70 font-light leading-relaxed">
                I'm Ankita — a Melbourne-based makeup artist with a passion for enhancing natural beauty. Whether you're walking down the aisle, stepping onto a stage, or simply want to feel your most radiant self, I'm here to create a look that's uniquely you.
              </p>

              <div className="flex flex-wrap gap-4 pt-4">
                {[
                  { value: "150+", label: "Happy Clients" },
                  { value: "5★", label: "Rated" },
                  { value: "3+", label: "Years Experience" }
                ].map((stat, i) => (
                  <div key={i} className="px-6 py-3 border border-[#d4af37]/30 rounded-full flex items-baseline gap-2 bg-[#d4af37]/5">
                    <span className="text-[#d4af37] font-bold">{stat.value}</span>
                    <span className="text-xs uppercase tracking-wider text-white/70">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full lg:w-1/2 order-1 lg:order-2 flex justify-center lg:justify-end">
              <div className="relative">
                <div className="absolute inset-0 rounded-full border border-[#d4af37] transform scale-[1.05] -rotate-6"></div>
                <div className="absolute inset-0 rounded-full border border-[#d4af37]/30 transform scale-[1.1] rotate-12"></div>
                <div className="w-72 h-72 md:w-96 md:h-96 rounded-full overflow-hidden border-4 border-[#1a1410] relative z-10">
                  <img 
                    src="/__mockup/images/glam-dark-about.png" 
                    alt="Ankita" 
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 relative text-center">
        <div className="max-w-3xl mx-auto px-6 space-y-8 relative z-10">
          <h2 className="font-cormorant text-5xl md:text-7xl text-white">Ready for your <span className="italic gold-gradient-text">transformation?</span></h2>
          <p className="text-lg text-white/60 font-light">Secure your date and let's create something beautiful together.</p>
          <div className="pt-8">
            <Button className="gold-gradient-bg text-black hover:opacity-90 font-semibold tracking-wider uppercase h-16 px-12 rounded-none text-sm">
              Book Your Appointment
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#050403] border-t border-[#d4af37]/20 pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-8 mb-16">
            <div className="text-center md:text-left space-y-4">
              <div className="font-cormorant text-2xl tracking-widest gold-gradient-text font-semibold uppercase">
                The Glam by Ankita
              </div>
              <p className="uppercase tracking-[0.2em] text-[#d4af37]/60 text-xs">Melbourne Makeup Artist</p>
            </div>
            
            <div className="flex items-center gap-6">
              <a href="mailto:theglambyankita@gmail.com" className="w-12 h-12 rounded-full border border-[#d4af37]/30 flex items-center justify-center text-[#d4af37] hover:bg-[#d4af37] hover:text-black transition-colors">
                <Mail className="w-5 h-5" />
              </a>
              <a href="https://instagram.com/theglambyankita" className="w-12 h-12 rounded-full border border-[#d4af37]/30 flex items-center justify-center text-[#d4af37] hover:bg-[#d4af37] hover:text-black transition-colors">
                <Instagram className="w-5 h-5" />
              </a>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-[#d4af37]/10 text-xs tracking-wider text-white/40 uppercase gap-4">
            <p>© 2025 The Glam by Ankita. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-[#d4af37] transition-colors">Privacy</a>
              <a href="#" className="hover:text-[#d4af37] transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default AfterDark;
