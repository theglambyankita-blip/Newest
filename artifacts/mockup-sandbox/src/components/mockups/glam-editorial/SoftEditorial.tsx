import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Instagram, Mail, Star, ChevronRight, ArrowRight } from "lucide-react";

export function SoftEditorial() {
  return (
    <div className="min-h-screen font-body text-slate-800 bg-[#faf8f5] selection:bg-[#d4a5a0] selection:text-white">
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,300;0,400;0,700;1,400&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&display=swap');
        
        .font-heading { font-family: 'Playfair Display', serif; }
        .font-body { font-family: 'Lato', sans-serif; }
        
        .bg-blush { background-color: #d4a5a0; }
        .text-blush { color: #d4a5a0; }
        .border-blush { border-color: #d4a5a0; }
        .bg-offwhite { background-color: #faf8f5; }
        
        .btn-primary {
          background-color: #d4a5a0;
          color: white;
          border: 1px solid #d4a5a0;
          transition: all 0.3s ease;
        }
        .btn-primary:hover {
          background-color: transparent;
          color: #d4a5a0;
        }
        .btn-secondary {
          background-color: transparent;
          color: #d4a5a0;
          border: 1px solid #d4a5a0;
          transition: all 0.3s ease;
        }
        .btn-secondary:hover {
          background-color: #d4a5a0;
          color: white;
        }
      `}} />

      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div className="font-heading text-2xl font-bold tracking-tight text-slate-900">
          The Glam
        </div>
        <div className="hidden md:flex gap-8 text-sm font-medium tracking-wide uppercase text-slate-600">
          <a href="#services" className="hover:text-blush transition-colors relative group">
            Services
            <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-blush transition-all group-hover:w-full"></span>
          </a>
          <a href="#about" className="hover:text-blush transition-colors relative group">
            About
            <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-blush transition-all group-hover:w-full"></span>
          </a>
          <a href="#portfolio" className="hover:text-blush transition-colors relative group">
            Portfolio
            <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-blush transition-all group-hover:w-full"></span>
          </a>
        </div>
        <button className="btn-primary px-6 py-2 rounded-none text-sm tracking-widest uppercase">
          Book Now
        </button>
      </nav>

      {/* Hero Section */}
      <section className="relative px-6 py-20 md:py-32 max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div className="order-2 md:order-1 flex flex-col items-start space-y-6">
          <Badge variant="outline" className="rounded-none border-blush text-blush px-4 py-1 uppercase tracking-widest text-xs font-light">
            Melbourne Makeup Artist
          </Badge>
          <h1 className="font-heading text-6xl md:text-7xl lg:text-[7rem] leading-[0.9] text-slate-900 font-medium">
            Beauty <br/>
            <span className="italic font-light text-slate-600">That Tells</span> <br/>
            Your Story
          </h1>
          <p className="font-body text-lg text-slate-500 max-w-md leading-relaxed font-light mt-4">
            Professional makeup artistry tailored to you — from soft everyday glam to full bridal transformations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 pt-6 w-full sm:w-auto">
            <button className="btn-primary px-8 py-4 text-sm tracking-widest uppercase flex items-center justify-center gap-2">
              Book Appointment <ArrowRight className="w-4 h-4" />
            </button>
            <button className="btn-secondary px-8 py-4 text-sm tracking-widest uppercase">
              View Portfolio
            </button>
          </div>
        </div>
        
        <div className="order-1 md:order-2 relative aspect-[3/4] md:aspect-auto md:h-[800px] w-full">
          <div className="absolute inset-0 bg-blush/10 translate-x-4 translate-y-4"></div>
          <img 
            src="/__mockup/images/glam-editorial-hero.png" 
            alt="Soft editorial beauty portrait" 
            className="absolute inset-0 w-full h-full object-cover z-10 filter contrast-[0.95]"
          />
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="bg-white py-24 px-6 border-t border-gray-100">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center text-center mb-16 space-y-4">
            <span className="uppercase tracking-widest text-blush text-xs font-bold">What I Offer</span>
            <h2 className="font-heading text-4xl md:text-5xl text-slate-900">Services & Specialties</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: "💄", title: "Soft Glam", price: "$100" },
              { icon: "✨", title: "Full Glam", price: "$120" },
              { icon: "🎉", title: "Party Glam", price: "$120" },
              { icon: "🎓", title: "Formal Makeup", price: "$120" },
              { icon: "👰", title: "Bridal Makeup", price: "$180" },
              { icon: "🌸", title: "Bridal Party", price: "$120 pp" },
              { icon: "🎨", title: "Editorial", price: "From $140" },
              { icon: "🎭", title: "Cultural", price: "From $120" },
            ].map((service, i) => (
              <Card key={i} className="rounded-none border border-blush/30 shadow-none hover:border-blush transition-colors bg-transparent group">
                <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
                  <div className="text-3xl grayscale group-hover:grayscale-0 transition-all opacity-80">{service.icon}</div>
                  <h3 className="font-heading text-xl text-slate-800">{service.title}</h3>
                  <div className="w-8 h-[1px] bg-blush/50"></div>
                  <p className="font-body text-slate-500 font-light">{service.price}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <div className="mt-16 flex justify-center">
            <button className="btn-secondary px-8 py-3 text-sm tracking-widest uppercase flex items-center gap-2">
              View Full Menu <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-24 px-6 relative overflow-hidden bg-[#faf8f5]">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-blush/5 -z-10"></div>
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <span className="uppercase tracking-widest text-blush text-xs font-bold">About Ankita</span>
            <h2 className="font-heading text-4xl md:text-5xl text-slate-900 leading-tight">
              The Artist <br/><span className="italic text-slate-500">Behind the Brush</span>
            </h2>
            <p className="font-body text-lg text-slate-600 font-light leading-relaxed">
              I'm Ankita — a Melbourne-based makeup artist with a passion for enhancing natural beauty. Whether you're walking down the aisle, stepping onto a stage, or simply want to feel your most radiant self, I'm here to create a look that's uniquely you.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <div className="flex flex-col items-center bg-white border border-blush/20 px-6 py-4 min-w-[140px]">
                <span className="font-heading text-2xl text-slate-800">150+</span>
                <span className="text-xs uppercase tracking-wider text-slate-500 mt-1">Happy Clients</span>
              </div>
              <div className="flex flex-col items-center bg-white border border-blush/20 px-6 py-4 min-w-[140px]">
                <span className="font-heading text-2xl text-slate-800 flex items-center gap-1">5<Star className="w-4 h-4 text-blush fill-blush" /></span>
                <span className="text-xs uppercase tracking-wider text-slate-500 mt-1">Rated</span>
              </div>
              <div className="flex flex-col items-center bg-white border border-blush/20 px-6 py-4 min-w-[140px]">
                <span className="font-heading text-2xl text-slate-800">3+</span>
                <span className="text-xs uppercase tracking-wider text-slate-500 mt-1">Years Exp.</span>
              </div>
            </div>
          </div>
          <div className="relative aspect-square md:aspect-[4/5] bg-slate-200">
             <div className="absolute inset-0 border border-blush -translate-x-4 translate-y-4"></div>
             <div className="absolute inset-0 bg-blush/20 flex items-center justify-center font-heading text-white text-2xl italic z-10 p-8 text-center">
               "Makeup is not a mask that covers up your beauty; it's a weapon that helps you express who you are from the inside."
             </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-16 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 border-b border-slate-800 pb-12 mb-8">
          <div className="text-center md:text-left space-y-2">
            <h2 className="font-heading text-3xl text-white">The Glam by Ankita</h2>
            <p className="font-body text-slate-400 font-light tracking-wide uppercase text-sm">Melbourne Makeup Artist</p>
          </div>
          <div className="flex gap-6">
            <a href="#" className="w-12 h-12 rounded-full border border-slate-700 flex items-center justify-center hover:bg-blush hover:border-blush hover:text-white transition-all">
              <Instagram className="w-5 h-5" />
            </a>
            <a href="mailto:theglambyankita@gmail.com" className="w-12 h-12 rounded-full border border-slate-700 flex items-center justify-center hover:bg-blush hover:border-blush hover:text-white transition-all">
              <Mail className="w-5 h-5" />
            </a>
          </div>
        </div>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-sm font-light text-slate-500">
          <p>© 2025 The Glam by Ankita. All rights reserved.</p>
          <div className="flex gap-4 mt-4 md:mt-0">
            <a href="#" className="hover:text-blush transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-blush transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
