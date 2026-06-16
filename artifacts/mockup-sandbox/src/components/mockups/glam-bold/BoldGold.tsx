import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Star, Heart, Instagram, Mail, Sparkles, Paintbrush, Glasses } from "lucide-react";

export function BoldGold() {
  return (
    <div className="min-h-screen bg-[#fdf6ec] text-[#1a0f08] font-lato selection:bg-[#d4af37] selection:text-white">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=Lato:wght@300;400;700&display=swap');
        
        .font-dm-sans { font-family: 'DM Sans', sans-serif; }
        .font-lato { font-family: 'Lato', sans-serif; }
        
        .espresso-bg { background-color: #1a0f08; }
        .espresso-text { color: #1a0f08; }
        .espresso-border { border-color: #1a0f08; }
        
        .cream-bg { background-color: #fdf6ec; }
        .cream-text { color: #fdf6ec; }
        
        .gold-accent { color: #d4af37; }
        .gold-bg { background-color: #d4af37; }
        .gold-border { border-color: #d4af37; }
      `}} />

      {/* Navigation */}
      <nav className="espresso-bg cream-text py-6 px-8 lg:px-16 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div className="font-dm-sans font-bold text-2xl tracking-wider uppercase">
          Ankita<span className="gold-accent">.</span>
        </div>
        <div className="hidden md:flex gap-8 font-dm-sans text-sm tracking-widest uppercase font-medium">
          <a href="#services" className="hover:text-[#d4af37] transition-colors duration-300">Services</a>
          <a href="#about" className="hover:text-[#d4af37] transition-colors duration-300">About</a>
          <a href="#portfolio" className="hover:text-[#d4af37] transition-colors duration-300">Portfolio</a>
        </div>
        <Button className="gold-bg espresso-text hover:bg-white transition-colors duration-300 font-dm-sans uppercase tracking-wider text-xs rounded-none px-6 py-5">
          Book Now
        </Button>
      </nav>

      {/* Hero Section */}
      <section className="relative espresso-bg cream-text min-h-[90vh] flex items-center overflow-hidden">
        {/* Background Image / Overlay */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[#1a0f08]/80 mix-blend-multiply z-10"></div>
          <img 
            src="/__mockup/images/bold-gold-hero.png" 
            alt="Beautiful confident woman with flawless makeup" 
            className="w-full h-full object-cover opacity-60"
          />
        </div>
        
        {/* Gold Decorative Line */}
        <div className="absolute top-0 left-16 w-[2px] h-32 gold-bg z-20"></div>

        <div className="container mx-auto px-6 relative z-20 pt-20">
          <div className="max-w-3xl">
            <div className="inline-block border border-[#d4af37] text-[#d4af37] font-dm-sans text-xs tracking-[0.3em] uppercase py-2 px-4 mb-8">
              Melbourne Makeup Artist
            </div>
            <h1 className="font-dm-sans font-bold text-6xl md:text-8xl leading-[1.1] mb-8 tracking-tight uppercase">
              Beauty That <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#d4af37] to-[#f3e5ab]">Tells Your Story</span>
            </h1>
            <p className="font-lato text-xl md:text-2xl font-light leading-relaxed mb-12 max-w-2xl text-gray-300">
              Professional makeup artistry tailored to you — from soft everyday glam to full bridal transformations.
            </p>
            <div className="flex flex-col sm:flex-row gap-6">
              <Button className="gold-bg espresso-text hover:bg-white text-base py-8 px-10 rounded-none font-dm-sans tracking-widest uppercase transition-all duration-300 transform hover:-translate-y-1">
                Book Appointment
              </Button>
              <Button variant="outline" className="bg-transparent border-[#d4af37] text-[#d4af37] hover:bg-[#d4af37] hover:text-[#1a0f08] text-base py-8 px-10 rounded-none font-dm-sans tracking-widest uppercase transition-all duration-300">
                View Portfolio
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-32 relative">
        <div className="container mx-auto px-6">
          <div className="flex flex-col items-center text-center mb-20">
            <span className="gold-accent font-dm-sans text-sm tracking-[0.2em] uppercase mb-4 flex items-center gap-4">
              <span className="w-12 h-[1px] gold-bg block"></span>
              What I Offer
              <span className="w-12 h-[1px] gold-bg block"></span>
            </span>
            <h2 className="font-dm-sans font-bold text-4xl md:text-6xl uppercase tracking-wider espresso-text">
              Services & Specialties
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { title: "Soft Glam", price: "$100", icon: "💄", desc: "Subtle enhancement for everyday elegance." },
              { title: "Full Glam", price: "$120", icon: "✨", desc: "High-impact makeup for special events." },
              { title: "Party Glam", price: "$120", icon: "🎉", desc: "Bold, long-lasting look for a night out." },
              { title: "Formal Makeup", price: "$120", icon: "🎓", desc: "Flawless finish for prom and galas." },
              { title: "Bridal Makeup", price: "$180", icon: "👰", desc: "Your dream look for your special day." },
              { title: "Bridal Party", price: "$120 pp", icon: "🌸", desc: "Cohesive beauty for your bridesmaids." },
              { title: "Editorial Makeup", price: "From $140", icon: "🎨", desc: "Creative concepts for photoshoots." },
              { title: "Festival Glam", price: "From $120", icon: "🎭", desc: "Vibrant, creative cultural looks." }
            ].map((service, idx) => (
              <Card key={idx} className={`rounded-none border-2 espresso-border cream-bg hover:bg-[#1a0f08] hover:text-[#fdf6ec] transition-all duration-500 group ${idx > 3 ? 'hidden lg:block' : ''}`}>
                <CardContent className="p-10 flex flex-col items-center text-center">
                  <div className="text-4xl mb-6 opacity-80 group-hover:scale-110 transition-transform duration-500">{service.icon}</div>
                  <h3 className="font-dm-sans font-bold text-xl uppercase tracking-wider mb-4 group-hover:text-[#d4af37] transition-colors">{service.title}</h3>
                  <p className="font-lato text-sm mb-6 opacity-70 leading-relaxed min-h-[40px]">{service.desc}</p>
                  <div className="mt-auto gold-accent font-dm-sans font-bold text-lg tracking-widest">
                    {service.price}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-16 text-center lg:hidden">
            <Button variant="outline" className="border-2 espresso-border espresso-text hover:bg-[#1a0f08] hover:text-[#fdf6ec] rounded-none py-6 px-10 font-dm-sans uppercase tracking-widest text-xs">
              View All Services
            </Button>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-32 espresso-bg cream-text relative overflow-hidden">
        {/* Decorative Gold Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 gold-bg opacity-10 rounded-bl-[100px]"></div>
        <div className="absolute bottom-20 left-10 w-24 h-24 border-4 border-[#d4af37] opacity-20 transform rotate-45"></div>

        <div className="container mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div className="relative">
              <div className="absolute -inset-4 border-2 border-[#d4af37] z-0 transform translate-x-4 translate-y-4"></div>
              <img 
                src="https://images.unsplash.com/photo-1595959183082-7b570b7e08e2?q=80&w=1000&auto=format&fit=crop" 
                alt="Makeup Artist at work" 
                className="relative z-10 w-full h-[600px] object-cover grayscale hover:grayscale-0 transition-all duration-700"
              />
            </div>
            
            <div>
              <span className="gold-accent font-dm-sans text-sm tracking-[0.2em] uppercase mb-4 block">
                About Ankita
              </span>
              <h2 className="font-dm-sans font-bold text-5xl md:text-6xl uppercase tracking-wider mb-10 leading-tight">
                The Artist <br/> Behind The Brush
              </h2>
              <div className="w-20 h-1 gold-bg mb-10"></div>
              <p className="font-lato text-xl font-light leading-relaxed mb-12 text-gray-300">
                I'm Ankita — a Melbourne-based makeup artist with a passion for enhancing natural beauty. Whether you're walking down the aisle, stepping onto a stage, or simply want to feel your most radiant self, I'm here to create a look that's uniquely you.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  { value: "150+", label: "Happy Clients" },
                  { value: "5★", label: "Rated" },
                  { value: "3+", label: "Years Exp." }
                ].map((stat, idx) => (
                  <div key={idx} className="border border-[#3a2818] p-6 text-center hover:border-[#d4af37] transition-colors duration-300">
                    <div className="gold-accent font-dm-sans font-bold text-3xl mb-2">{stat.value}</div>
                    <div className="font-dm-sans text-xs tracking-widest uppercase opacity-70">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black cream-text py-20 border-t-4 border-[#d4af37]">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center md:text-left">
            <div>
              <h3 className="font-dm-sans font-bold text-3xl tracking-wider uppercase mb-2">
                Ankita<span className="gold-accent">.</span>
              </h3>
              <p className="font-dm-sans text-sm tracking-[0.2em] uppercase gold-accent mb-6">Melbourne Makeup Artist</p>
              <p className="font-lato text-gray-400 max-w-xs mx-auto md:mx-0">
                Enhancing your natural beauty for every special occasion.
              </p>
            </div>
            
            <div className="flex flex-col items-center md:items-start">
              <h4 className="font-dm-sans font-bold text-lg tracking-widest uppercase mb-6">Contact</h4>
              <a href="mailto:theglambyankita@gmail.com" className="font-lato text-gray-400 hover:text-[#d4af37] mb-4 flex items-center gap-3 transition-colors">
                <Mail size={18} /> theglambyankita@gmail.com
              </a>
              <a href="https://instagram.com/theglambyankita" className="font-lato text-gray-400 hover:text-[#d4af37] flex items-center gap-3 transition-colors">
                <Instagram size={18} /> @theglambyankita
              </a>
            </div>
            
            <div className="flex flex-col items-center md:items-end text-center md:text-right">
              <h4 className="font-dm-sans font-bold text-lg tracking-widest uppercase mb-6">Follow</h4>
              <p className="font-lato text-gray-400 mb-6">
                Stay updated with my latest work and behind the scenes on Instagram.
              </p>
              <div className="flex gap-4">
                <a href="#" className="w-12 h-12 border border-gray-700 flex items-center justify-center hover:border-[#d4af37] hover:text-[#d4af37] transition-all">
                  <Instagram size={20} />
                </a>
              </div>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-16 pt-8 flex flex-col md:flex-row justify-between items-center text-xs font-dm-sans tracking-widest uppercase text-gray-500">
            <p>© 2025 The Glam by Ankita.</p>
            <p className="mt-4 md:mt-0">All Rights Reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default BoldGold;