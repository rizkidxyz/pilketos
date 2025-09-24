CREATE TABLE `kandidat` (
  `id` int(11) NOT NULL,
  `nomor` int(11) NOT NULL,
  `ft` varchar(50) NOT NULL,
  `nama` varchar(200) NOT NULL,
  `visi` text NOT NULL,
  `misi` text NOT NULL,
  `detail` mediumtext DEFAULT NULL,
  `suara` int(11) DEFAULT 0,
  `create_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `nama` varchar(100) NOT NULL,
  `kelas` varchar(100) NOT NULL,
  `password` varchar(225) NOT NULL,
  `voted` varchar(5) DEFAULT NULL,
  `admin` varchar(5) NOT NULL DEFAULT 'false',
  `created` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

ALTER TABLE `kandidat`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `nomor` (`nomor`);

ALTER TABLE `users`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `kandidat`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;
COMMIT;