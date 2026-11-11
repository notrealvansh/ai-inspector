import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";

import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative flex min-h-screen flex-col bg-grid"
    >
      <div className="border-b border-border/60 px-4 py-4 md:px-6">
        <div className="mx-auto max-w-6xl">
          <Brand />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            Error 404
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">Off the trace.</h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            This page does not exist. The route may have moved, or the link was
            incorrect.
          </p>
          <Button asChild className="mt-6 gap-2">
            <Link to="/">
              <ArrowLeft className="size-4" />
              Back home
            </Link>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
