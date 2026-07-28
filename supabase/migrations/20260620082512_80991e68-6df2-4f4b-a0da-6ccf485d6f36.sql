
CREATE POLICY "park-assets public read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'park-assets');
CREATE POLICY "park-assets admin insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'park-assets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "park-assets admin update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'park-assets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "park-assets admin delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'park-assets' AND public.has_role(auth.uid(), 'admin'));
