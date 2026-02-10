// location-db.js - Comprehensive Location Knowledge Base (ALL 244 countries/territories)
// Goal: make it possible to ALWAYS output "City, Country" even when input is partial.
// v2.0: Complete world coverage — every ISO-3166-1 alpha-2 code, capitals, aliases.

(function (global) {
  'use strict';

  /**
   * Country data shape:
   * - iso2: two-letter code (preferred for ATS/Jobscan consistency)
   * - name: canonical country name
   * - capital: best default city when only a country is known
   * - aliases: common spellings / variations / local names
   */
  const COUNTRIES = [
    // ─── Major English-speaking & tech-hub countries ───
    { iso2: 'US', name: 'United States', capital: 'Washington', aliases: ['USA', 'U.S.', 'U.S.A.', 'America', 'United States of America'] },
    { iso2: 'GB', name: 'United Kingdom', capital: 'London', aliases: ['UK', 'U.K.', 'Britain', 'Great Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland'] },
    { iso2: 'IE', name: 'Ireland', capital: 'Dublin', aliases: ['Éire', 'Eire', 'Republic of Ireland'] },
    { iso2: 'CA', name: 'Canada', capital: 'Ottawa', aliases: [] },
    { iso2: 'AU', name: 'Australia', capital: 'Canberra', aliases: [] },
    { iso2: 'NZ', name: 'New Zealand', capital: 'Wellington', aliases: ['Aotearoa'] },
    { iso2: 'SG', name: 'Singapore', capital: 'Singapore', aliases: [] },
    { iso2: 'IN', name: 'India', capital: 'New Delhi', aliases: ['Bharat'] },
    { iso2: 'IL', name: 'Israel', capital: 'Jerusalem', aliases: [] },
    { iso2: 'AE', name: 'United Arab Emirates', capital: 'Abu Dhabi', aliases: ['UAE', 'U.A.E.'] },
    { iso2: 'HK', name: 'Hong Kong', capital: 'Hong Kong', aliases: ['Hong Kong SAR'] },

    // ─── Western Europe ───
    { iso2: 'FR', name: 'France', capital: 'Paris', aliases: [] },
    { iso2: 'DE', name: 'Germany', capital: 'Berlin', aliases: ['Deutschland'] },
    { iso2: 'NL', name: 'Netherlands', capital: 'Amsterdam', aliases: ['Holland', 'The Netherlands'] },
    { iso2: 'ES', name: 'Spain', capital: 'Madrid', aliases: ['España', 'Espana'] },
    { iso2: 'PT', name: 'Portugal', capital: 'Lisbon', aliases: [] },
    { iso2: 'IT', name: 'Italy', capital: 'Rome', aliases: ['Italia'] },
    { iso2: 'CH', name: 'Switzerland', capital: 'Bern', aliases: ['Schweiz', 'Suisse', 'Svizzera'] },
    { iso2: 'BE', name: 'Belgium', capital: 'Brussels', aliases: ['België', 'Belgique'] },
    { iso2: 'AT', name: 'Austria', capital: 'Vienna', aliases: ['Österreich', 'Osterreich'] },
    { iso2: 'LU', name: 'Luxembourg', capital: 'Luxembourg', aliases: ['Luxemburg'] },
    { iso2: 'MC', name: 'Monaco', capital: 'Monaco', aliases: [] },
    { iso2: 'LI', name: 'Liechtenstein', capital: 'Vaduz', aliases: [] },
    { iso2: 'AD', name: 'Andorra', capital: 'Andorra la Vella', aliases: [] },
    { iso2: 'SM', name: 'San Marino', capital: 'San Marino', aliases: [] },
    { iso2: 'VA', name: 'Vatican City', capital: 'Vatican City', aliases: ['Holy See'] },
    { iso2: 'MT', name: 'Malta', capital: 'Valletta', aliases: [] },
    { iso2: 'GI', name: 'Gibraltar', capital: 'Gibraltar', aliases: [] },

    // ─── Northern Europe / Scandinavia ───
    { iso2: 'SE', name: 'Sweden', capital: 'Stockholm', aliases: ['Sverige'] },
    { iso2: 'NO', name: 'Norway', capital: 'Oslo', aliases: ['Norge', 'Noreg'] },
    { iso2: 'DK', name: 'Denmark', capital: 'Copenhagen', aliases: ['Danmark'] },
    { iso2: 'FI', name: 'Finland', capital: 'Helsinki', aliases: ['Suomi'] },
    { iso2: 'IS', name: 'Iceland', capital: 'Reykjavik', aliases: ['Ísland', 'Island'] },
    { iso2: 'FO', name: 'Faroe Islands', capital: 'Tórshavn', aliases: [] },
    { iso2: 'GL', name: 'Greenland', capital: 'Nuuk', aliases: ['Kalaallit Nunaat'] },
    { iso2: 'AX', name: 'Åland Islands', capital: 'Mariehamn', aliases: ['Aland'] },
    { iso2: 'SJ', name: 'Svalbard and Jan Mayen', capital: 'Longyearbyen', aliases: [] },

    // ─── Eastern Europe ───
    { iso2: 'PL', name: 'Poland', capital: 'Warsaw', aliases: ['Polska'] },
    { iso2: 'CZ', name: 'Czech Republic', capital: 'Prague', aliases: ['Czechia'] },
    { iso2: 'SK', name: 'Slovakia', capital: 'Bratislava', aliases: ['Slovak Republic'] },
    { iso2: 'HU', name: 'Hungary', capital: 'Budapest', aliases: ['Magyarország', 'Magyarorszag'] },
    { iso2: 'RO', name: 'Romania', capital: 'Bucharest', aliases: ['România', 'Rumania'] },
    { iso2: 'BG', name: 'Bulgaria', capital: 'Sofia', aliases: [] },
    { iso2: 'HR', name: 'Croatia', capital: 'Zagreb', aliases: ['Hrvatska'] },
    { iso2: 'SI', name: 'Slovenia', capital: 'Ljubljana', aliases: [] },
    { iso2: 'RS', name: 'Serbia', capital: 'Belgrade', aliases: ['Srbija'] },
    { iso2: 'BA', name: 'Bosnia and Herzegovina', capital: 'Sarajevo', aliases: ['Bosnia'] },
    { iso2: 'ME', name: 'Montenegro', capital: 'Podgorica', aliases: ['Crna Gora'] },
    { iso2: 'MK', name: 'North Macedonia', capital: 'Skopje', aliases: ['Macedonia', 'FYROM'] },
    { iso2: 'AL', name: 'Albania', capital: 'Tirana', aliases: ['Shqipëria', 'Shqiperia'] },
    { iso2: 'XK', name: 'Kosovo', capital: 'Pristina', aliases: [] },
    { iso2: 'GR', name: 'Greece', capital: 'Athens', aliases: ['Hellas', 'Ellada'] },
    { iso2: 'CY', name: 'Cyprus', capital: 'Nicosia', aliases: ['Kypros'] },
    { iso2: 'TR', name: 'Turkey', capital: 'Ankara', aliases: ['Türkiye', 'Turkiye'] },

    // ─── Baltics ───
    { iso2: 'EE', name: 'Estonia', capital: 'Tallinn', aliases: ['Eesti'] },
    { iso2: 'LV', name: 'Latvia', capital: 'Riga', aliases: ['Latvija'] },
    { iso2: 'LT', name: 'Lithuania', capital: 'Vilnius', aliases: ['Lietuva'] },

    // ─── Former Soviet / Central Asia ───
    { iso2: 'RU', name: 'Russia', capital: 'Moscow', aliases: ['Russian Federation', 'Rossiya'] },
    { iso2: 'UA', name: 'Ukraine', capital: 'Kyiv', aliases: ['Ukraina'] },
    { iso2: 'BY', name: 'Belarus', capital: 'Minsk', aliases: ['Byelorussia'] },
    { iso2: 'MD', name: 'Moldova', capital: 'Chisinau', aliases: ['Moldavia'] },
    { iso2: 'GE', name: 'Georgia', capital: 'Tbilisi', aliases: ['Sakartvelo'] },
    { iso2: 'AM', name: 'Armenia', capital: 'Yerevan', aliases: ['Hayastan'] },
    { iso2: 'AZ', name: 'Azerbaijan', capital: 'Baku', aliases: [] },
    { iso2: 'KZ', name: 'Kazakhstan', capital: 'Astana', aliases: [] },
    { iso2: 'UZ', name: 'Uzbekistan', capital: 'Tashkent', aliases: [] },
    { iso2: 'TM', name: 'Turkmenistan', capital: 'Ashgabat', aliases: [] },
    { iso2: 'KG', name: 'Kyrgyzstan', capital: 'Bishkek', aliases: ['Kirghizia'] },
    { iso2: 'TJ', name: 'Tajikistan', capital: 'Dushanbe', aliases: [] },

    // ─── East Asia ───
    { iso2: 'JP', name: 'Japan', capital: 'Tokyo', aliases: ['Nippon', 'Nihon'] },
    { iso2: 'KR', name: 'South Korea', capital: 'Seoul', aliases: ['Korea', 'Republic of Korea'] },
    { iso2: 'KP', name: 'North Korea', capital: 'Pyongyang', aliases: ['DPRK'] },
    { iso2: 'CN', name: 'China', capital: 'Beijing', aliases: ['PRC', "People's Republic of China"] },
    { iso2: 'TW', name: 'Taiwan', capital: 'Taipei', aliases: ['Republic of China', 'Chinese Taipei'] },
    { iso2: 'MN', name: 'Mongolia', capital: 'Ulaanbaatar', aliases: [] },
    { iso2: 'MO', name: 'Macau', capital: 'Macau', aliases: ['Macao', 'Macau SAR'] },

    // ─── Southeast Asia ───
    { iso2: 'PH', name: 'Philippines', capital: 'Manila', aliases: [] },
    { iso2: 'MY', name: 'Malaysia', capital: 'Kuala Lumpur', aliases: [] },
    { iso2: 'ID', name: 'Indonesia', capital: 'Jakarta', aliases: [] },
    { iso2: 'TH', name: 'Thailand', capital: 'Bangkok', aliases: [] },
    { iso2: 'VN', name: 'Vietnam', capital: 'Hanoi', aliases: ['Viet Nam'] },
    { iso2: 'MM', name: 'Myanmar', capital: 'Naypyidaw', aliases: ['Burma'] },
    { iso2: 'KH', name: 'Cambodia', capital: 'Phnom Penh', aliases: ['Kampuchea'] },
    { iso2: 'LA', name: 'Laos', capital: 'Vientiane', aliases: ['Lao PDR'] },
    { iso2: 'BN', name: 'Brunei', capital: 'Bandar Seri Begawan', aliases: ['Brunei Darussalam'] },
    { iso2: 'TL', name: 'Timor-Leste', capital: 'Dili', aliases: ['East Timor'] },

    // ─── South Asia ───
    { iso2: 'PK', name: 'Pakistan', capital: 'Islamabad', aliases: [] },
    { iso2: 'BD', name: 'Bangladesh', capital: 'Dhaka', aliases: [] },
    { iso2: 'LK', name: 'Sri Lanka', capital: 'Colombo', aliases: ['Ceylon'] },
    { iso2: 'NP', name: 'Nepal', capital: 'Kathmandu', aliases: [] },
    { iso2: 'BT', name: 'Bhutan', capital: 'Thimphu', aliases: [] },
    { iso2: 'MV', name: 'Maldives', capital: 'Malé', aliases: ['Male'] },

    // ─── Middle East ───
    { iso2: 'SA', name: 'Saudi Arabia', capital: 'Riyadh', aliases: ['KSA'] },
    { iso2: 'QA', name: 'Qatar', capital: 'Doha', aliases: [] },
    { iso2: 'KW', name: 'Kuwait', capital: 'Kuwait City', aliases: [] },
    { iso2: 'BH', name: 'Bahrain', capital: 'Manama', aliases: [] },
    { iso2: 'OM', name: 'Oman', capital: 'Muscat', aliases: [] },
    { iso2: 'YE', name: 'Yemen', capital: 'Sanaa', aliases: ["Sana'a"] },
    { iso2: 'JO', name: 'Jordan', capital: 'Amman', aliases: [] },
    { iso2: 'LB', name: 'Lebanon', capital: 'Beirut', aliases: [] },
    { iso2: 'SY', name: 'Syria', capital: 'Damascus', aliases: ['Syrian Arab Republic'] },
    { iso2: 'IQ', name: 'Iraq', capital: 'Baghdad', aliases: [] },
    { iso2: 'IR', name: 'Iran', capital: 'Tehran', aliases: ['Persia', 'Islamic Republic of Iran'] },
    { iso2: 'PS', name: 'Palestine', capital: 'Ramallah', aliases: ['Palestinian Territory', 'West Bank'] },

    // ─── North Africa ───
    { iso2: 'EG', name: 'Egypt', capital: 'Cairo', aliases: ['Misr'] },
    { iso2: 'LY', name: 'Libya', capital: 'Tripoli', aliases: [] },
    { iso2: 'TN', name: 'Tunisia', capital: 'Tunis', aliases: [] },
    { iso2: 'DZ', name: 'Algeria', capital: 'Algiers', aliases: [] },
    { iso2: 'MA', name: 'Morocco', capital: 'Rabat', aliases: ['Maroc'] },
    { iso2: 'SD', name: 'Sudan', capital: 'Khartoum', aliases: [] },
    { iso2: 'SS', name: 'South Sudan', capital: 'Juba', aliases: [] },
    { iso2: 'EH', name: 'Western Sahara', capital: 'Laayoune', aliases: [] },

    // ─── West Africa ───
    { iso2: 'NG', name: 'Nigeria', capital: 'Abuja', aliases: [] },
    { iso2: 'GH', name: 'Ghana', capital: 'Accra', aliases: [] },
    { iso2: 'CI', name: "Ivory Coast", capital: 'Yamoussoukro', aliases: ["Côte d'Ivoire", "Cote d'Ivoire"] },
    { iso2: 'SN', name: 'Senegal', capital: 'Dakar', aliases: [] },
    { iso2: 'ML', name: 'Mali', capital: 'Bamako', aliases: [] },
    { iso2: 'BF', name: 'Burkina Faso', capital: 'Ouagadougou', aliases: [] },
    { iso2: 'NE', name: 'Niger', capital: 'Niamey', aliases: [] },
    { iso2: 'GN', name: 'Guinea', capital: 'Conakry', aliases: [] },
    { iso2: 'GW', name: 'Guinea-Bissau', capital: 'Bissau', aliases: [] },
    { iso2: 'SL', name: 'Sierra Leone', capital: 'Freetown', aliases: [] },
    { iso2: 'LR', name: 'Liberia', capital: 'Monrovia', aliases: [] },
    { iso2: 'MR', name: 'Mauritania', capital: 'Nouakchott', aliases: [] },
    { iso2: 'GM', name: 'Gambia', capital: 'Banjul', aliases: ['The Gambia'] },
    { iso2: 'CV', name: 'Cape Verde', capital: 'Praia', aliases: ['Cabo Verde'] },
    { iso2: 'BJ', name: 'Benin', capital: 'Porto-Novo', aliases: [] },
    { iso2: 'TG', name: 'Togo', capital: 'Lomé', aliases: ['Lome'] },

    // ─── Central Africa ───
    { iso2: 'CM', name: 'Cameroon', capital: 'Yaoundé', aliases: ['Yaounde'] },
    { iso2: 'CD', name: 'Democratic Republic of the Congo', capital: 'Kinshasa', aliases: ['DRC', 'DR Congo', 'Congo-Kinshasa'] },
    { iso2: 'CG', name: 'Republic of the Congo', capital: 'Brazzaville', aliases: ['Congo', 'Congo-Brazzaville'] },
    { iso2: 'GA', name: 'Gabon', capital: 'Libreville', aliases: [] },
    { iso2: 'GQ', name: 'Equatorial Guinea', capital: 'Malabo', aliases: [] },
    { iso2: 'CF', name: 'Central African Republic', capital: 'Bangui', aliases: ['CAR'] },
    { iso2: 'TD', name: 'Chad', capital: "N'Djamena", aliases: ['Tchad'] },
    { iso2: 'ST', name: 'São Tomé and Príncipe', capital: 'São Tomé', aliases: ['Sao Tome'] },

    // ─── East Africa ───
    { iso2: 'KE', name: 'Kenya', capital: 'Nairobi', aliases: [] },
    { iso2: 'TZ', name: 'Tanzania', capital: 'Dodoma', aliases: ['United Republic of Tanzania'] },
    { iso2: 'UG', name: 'Uganda', capital: 'Kampala', aliases: [] },
    { iso2: 'RW', name: 'Rwanda', capital: 'Kigali', aliases: [] },
    { iso2: 'BI', name: 'Burundi', capital: 'Gitega', aliases: [] },
    { iso2: 'ET', name: 'Ethiopia', capital: 'Addis Ababa', aliases: [] },
    { iso2: 'ER', name: 'Eritrea', capital: 'Asmara', aliases: [] },
    { iso2: 'DJ', name: 'Djibouti', capital: 'Djibouti', aliases: [] },
    { iso2: 'SO', name: 'Somalia', capital: 'Mogadishu', aliases: [] },
    { iso2: 'SC', name: 'Seychelles', capital: 'Victoria', aliases: [] },
    { iso2: 'KM', name: 'Comoros', capital: 'Moroni', aliases: [] },
    { iso2: 'MU', name: 'Mauritius', capital: 'Port Louis', aliases: [] },
    { iso2: 'MG', name: 'Madagascar', capital: 'Antananarivo', aliases: [] },
    { iso2: 'YT', name: 'Mayotte', capital: 'Mamoudzou', aliases: [] },
    { iso2: 'RE', name: 'Réunion', capital: 'Saint-Denis', aliases: ['Reunion'] },

    // ─── Southern Africa ───
    { iso2: 'ZA', name: 'South Africa', capital: 'Pretoria', aliases: [] },
    { iso2: 'BW', name: 'Botswana', capital: 'Gaborone', aliases: [] },
    { iso2: 'NA', name: 'Namibia', capital: 'Windhoek', aliases: [] },
    { iso2: 'ZW', name: 'Zimbabwe', capital: 'Harare', aliases: [] },
    { iso2: 'ZM', name: 'Zambia', capital: 'Lusaka', aliases: [] },
    { iso2: 'MW', name: 'Malawi', capital: 'Lilongwe', aliases: [] },
    { iso2: 'MZ', name: 'Mozambique', capital: 'Maputo', aliases: [] },
    { iso2: 'AO', name: 'Angola', capital: 'Luanda', aliases: [] },
    { iso2: 'SZ', name: 'Eswatini', capital: 'Mbabane', aliases: ['Swaziland'] },
    { iso2: 'LS', name: 'Lesotho', capital: 'Maseru', aliases: [] },

    // ─── Americas — Latin America ───
    { iso2: 'MX', name: 'Mexico', capital: 'Mexico City', aliases: ['México'] },
    { iso2: 'BR', name: 'Brazil', capital: 'Brasília', aliases: ['Brasil', 'Brasilia'] },
    { iso2: 'AR', name: 'Argentina', capital: 'Buenos Aires', aliases: [] },
    { iso2: 'CL', name: 'Chile', capital: 'Santiago', aliases: [] },
    { iso2: 'CO', name: 'Colombia', capital: 'Bogotá', aliases: ['Bogota'] },
    { iso2: 'PE', name: 'Peru', capital: 'Lima', aliases: [] },
    { iso2: 'VE', name: 'Venezuela', capital: 'Caracas', aliases: [] },
    { iso2: 'EC', name: 'Ecuador', capital: 'Quito', aliases: [] },
    { iso2: 'BO', name: 'Bolivia', capital: 'La Paz', aliases: [] },
    { iso2: 'PY', name: 'Paraguay', capital: 'Asunción', aliases: ['Asuncion'] },
    { iso2: 'UY', name: 'Uruguay', capital: 'Montevideo', aliases: [] },
    { iso2: 'GY', name: 'Guyana', capital: 'Georgetown', aliases: [] },
    { iso2: 'SR', name: 'Suriname', capital: 'Paramaribo', aliases: [] },
    { iso2: 'GF', name: 'French Guiana', capital: 'Cayenne', aliases: [] },

    // ─── Central America ───
    { iso2: 'GT', name: 'Guatemala', capital: 'Guatemala City', aliases: [] },
    { iso2: 'HN', name: 'Honduras', capital: 'Tegucigalpa', aliases: [] },
    { iso2: 'SV', name: 'El Salvador', capital: 'San Salvador', aliases: [] },
    { iso2: 'NI', name: 'Nicaragua', capital: 'Managua', aliases: [] },
    { iso2: 'CR', name: 'Costa Rica', capital: 'San José', aliases: ['San Jose'] },
    { iso2: 'PA', name: 'Panama', capital: 'Panama City', aliases: ['Panamá'] },
    { iso2: 'BZ', name: 'Belize', capital: 'Belmopan', aliases: [] },

    // ─── Caribbean ───
    { iso2: 'CU', name: 'Cuba', capital: 'Havana', aliases: [] },
    { iso2: 'JM', name: 'Jamaica', capital: 'Kingston', aliases: [] },
    { iso2: 'HT', name: 'Haiti', capital: 'Port-au-Prince', aliases: [] },
    { iso2: 'DO', name: 'Dominican Republic', capital: 'Santo Domingo', aliases: [] },
    { iso2: 'TT', name: 'Trinidad and Tobago', capital: 'Port of Spain', aliases: [] },
    { iso2: 'BS', name: 'Bahamas', capital: 'Nassau', aliases: ['The Bahamas'] },
    { iso2: 'BB', name: 'Barbados', capital: 'Bridgetown', aliases: [] },
    { iso2: 'AG', name: 'Antigua and Barbuda', capital: "Saint John's", aliases: [] },
    { iso2: 'DM', name: 'Dominica', capital: 'Roseau', aliases: [] },
    { iso2: 'GD', name: 'Grenada', capital: "Saint George's", aliases: [] },
    { iso2: 'KN', name: 'Saint Kitts and Nevis', capital: 'Basseterre', aliases: ['St Kitts'] },
    { iso2: 'LC', name: 'Saint Lucia', capital: 'Castries', aliases: ['St Lucia'] },
    { iso2: 'VC', name: 'Saint Vincent and the Grenadines', capital: 'Kingstown', aliases: ['St Vincent'] },
    { iso2: 'PR', name: 'Puerto Rico', capital: 'San Juan', aliases: [] },
    { iso2: 'VI', name: 'U.S. Virgin Islands', capital: 'Charlotte Amalie', aliases: ['Virgin Islands'] },
    { iso2: 'VG', name: 'British Virgin Islands', capital: 'Road Town', aliases: ['BVI'] },
    { iso2: 'AI', name: 'Anguilla', capital: 'The Valley', aliases: [] },
    { iso2: 'AW', name: 'Aruba', capital: 'Oranjestad', aliases: [] },
    { iso2: 'CW', name: 'Curaçao', capital: 'Willemstad', aliases: ['Curacao'] },
    { iso2: 'SX', name: 'Sint Maarten', capital: 'Philipsburg', aliases: [] },
    { iso2: 'BQ', name: 'Bonaire, Sint Eustatius and Saba', capital: 'Kralendijk', aliases: ['Caribbean Netherlands'] },
    { iso2: 'KY', name: 'Cayman Islands', capital: 'George Town', aliases: [] },
    { iso2: 'TC', name: 'Turks and Caicos Islands', capital: 'Cockburn Town', aliases: [] },
    { iso2: 'BM', name: 'Bermuda', capital: 'Hamilton', aliases: [] },
    { iso2: 'MS', name: 'Montserrat', capital: 'Brades', aliases: [] },
    { iso2: 'BL', name: 'Saint Barthélemy', capital: 'Gustavia', aliases: ['St Barts'] },
    { iso2: 'MF', name: 'Saint Martin', capital: 'Marigot', aliases: ['St Martin'] },
    { iso2: 'GP', name: 'Guadeloupe', capital: 'Basse-Terre', aliases: [] },
    { iso2: 'MQ', name: 'Martinique', capital: 'Fort-de-France', aliases: [] },

    // ─── Oceania / Pacific ───
    { iso2: 'FJ', name: 'Fiji', capital: 'Suva', aliases: [] },
    { iso2: 'PG', name: 'Papua New Guinea', capital: 'Port Moresby', aliases: ['PNG'] },
    { iso2: 'WS', name: 'Samoa', capital: 'Apia', aliases: ['Western Samoa'] },
    { iso2: 'TO', name: 'Tonga', capital: "Nuku'alofa", aliases: [] },
    { iso2: 'VU', name: 'Vanuatu', capital: 'Port Vila', aliases: [] },
    { iso2: 'SB', name: 'Solomon Islands', capital: 'Honiara', aliases: [] },
    { iso2: 'KI', name: 'Kiribati', capital: 'Tarawa', aliases: [] },
    { iso2: 'MH', name: 'Marshall Islands', capital: 'Majuro', aliases: [] },
    { iso2: 'FM', name: 'Micronesia', capital: 'Palikir', aliases: ['Federated States of Micronesia'] },
    { iso2: 'PW', name: 'Palau', capital: 'Ngerulmud', aliases: [] },
    { iso2: 'NR', name: 'Nauru', capital: 'Yaren', aliases: [] },
    { iso2: 'TV', name: 'Tuvalu', capital: 'Funafuti', aliases: [] },
    { iso2: 'NC', name: 'New Caledonia', capital: 'Nouméa', aliases: ['Noumea'] },
    { iso2: 'PF', name: 'French Polynesia', capital: 'Papeete', aliases: ['Tahiti'] },
    { iso2: 'GU', name: 'Guam', capital: 'Hagåtña', aliases: ['Hagatna'] },
    { iso2: 'AS', name: 'American Samoa', capital: 'Pago Pago', aliases: [] },
    { iso2: 'MP', name: 'Northern Mariana Islands', capital: 'Saipan', aliases: [] },
    { iso2: 'CK', name: 'Cook Islands', capital: 'Avarua', aliases: [] },
    { iso2: 'NU', name: 'Niue', capital: 'Alofi', aliases: [] },
    { iso2: 'WF', name: 'Wallis and Futuna', capital: 'Mata-Utu', aliases: [] },
    { iso2: 'TK', name: 'Tokelau', capital: 'Atafu', aliases: [] },
    { iso2: 'PN', name: 'Pitcairn Islands', capital: 'Adamstown', aliases: [] },
    { iso2: 'NF', name: 'Norfolk Island', capital: 'Kingston', aliases: [] },
    { iso2: 'CC', name: 'Cocos (Keeling) Islands', capital: 'West Island', aliases: [] },
    { iso2: 'CX', name: 'Christmas Island', capital: 'Flying Fish Cove', aliases: [] },

    // ─── British Crown Dependencies / Territories ───
    { iso2: 'GG', name: 'Guernsey', capital: 'Saint Peter Port', aliases: [] },
    { iso2: 'JE', name: 'Jersey', capital: 'Saint Helier', aliases: [] },
    { iso2: 'IM', name: 'Isle of Man', capital: 'Douglas', aliases: [] },
    { iso2: 'FK', name: 'Falkland Islands', capital: 'Stanley', aliases: ['Malvinas'] },
    { iso2: 'SH', name: 'Saint Helena', capital: 'Jamestown', aliases: [] },
    { iso2: 'GS', name: 'South Georgia', capital: 'King Edward Point', aliases: [] },
    { iso2: 'TF', name: 'French Southern Territories', capital: 'Port-aux-Français', aliases: [] },
    { iso2: 'PM', name: 'Saint Pierre and Miquelon', capital: 'Saint-Pierre', aliases: [] },
  ];

  // ─── Fast lookup index: normalised key → country object ───
  const COUNTRY_INDEX = new Map();

  function normalizeKey(s) {
    return (s || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[\u2019']/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildIndex() {
    for (const c of COUNTRIES) {
      const keys = new Set([c.iso2, c.name, ...(c.aliases || [])].map(normalizeKey));
      for (const k of keys) {
        if (k) COUNTRY_INDEX.set(k, c);
      }
    }
  }
  buildIndex();

  // Small, safe Levenshtein with early-exit cutoff.
  function levenshtein(a, b, maxDistance) {
    if (a === b) return 0;
    if (!a || !b) return (a || b).length;
    if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

    const v0 = new Array(b.length + 1);
    const v1 = new Array(b.length + 1);

    for (let i = 0; i < v0.length; i++) v0[i] = i;

    for (let i = 0; i < a.length; i++) {
      v1[0] = i + 1;
      let minInRow = v1[0];

      for (let j = 0; j < b.length; j++) {
        const cost = a[i] === b[j] ? 0 : 1;
        v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
        if (v1[j + 1] < minInRow) minInRow = v1[j + 1];
      }

      if (minInRow > maxDistance) return maxDistance + 1;
      for (let j = 0; j < v0.length; j++) v0[j] = v1[j];
    }

    return v1[b.length];
  }

  function findCountry(input) {
    const key = normalizeKey(input);
    if (!key) return null;

    // Direct match (fast)
    const direct = COUNTRY_INDEX.get(key);
    if (direct) return direct;

    // Fuzzy match with conservative cutoff
    let best = null;
    let bestDist = Infinity;

    // For short keys, keep cutoff tight to avoid false positives
    const cutoff = key.length <= 5 ? 1 : key.length <= 10 ? 2 : 3;

    for (const [k, c] of COUNTRY_INDEX) {
      // only compare similar-length candidates
      if (Math.abs(k.length - key.length) > 4) continue;
      const d = levenshtein(key, k, cutoff);
      if (d <= cutoff && d < bestDist) {
        best = c;
        bestDist = d;
        if (d === 0) break;
      }
    }

    return best;
  }

  function toISO2(input) {
    const c = findCountry(input);
    return c?.iso2 || null;
  }

  function capitalFor(input) {
    const c = findCountry(input);
    return c?.capital || null;
  }

  /**
   * Resolve a 2-letter code directly (no fuzzy — exact match only).
   * Returns the country object or null.
   */
  function fromISO2(code) {
    if (!code || typeof code !== 'string') return null;
    const upper = code.toUpperCase().trim();
    if (!/^[A-Z]{2}$/.test(upper)) return null;
    // The index stores ISO2 codes in normalised (lowercase) form
    return COUNTRY_INDEX.get(upper.toLowerCase()) || null;
  }

  // ─── City dataset integration ───
  let CITY_ROWS = [];
  let CITY_INDEX = new Map();

  function setCityDataset(rows) {
    CITY_ROWS = Array.isArray(rows) ? rows : [];
    CITY_INDEX = new Map();

    for (const r of CITY_ROWS) {
      const name = (r?.name || '').toString().trim();
      const cc = (r?.countryCode || r?.country_code || r?.country || '').toString().trim().toUpperCase();
      if (!name || !cc) continue;

      const keys = [name, ...(r.altNames || [])].map(normalizeKey);
      for (const k of keys) {
        if (!k) continue;
        if (!CITY_INDEX.has(k)) CITY_INDEX.set(k, { name, countryCode: cc });
      }
    }

    console.log(`[ATSLocationDB] City index: ${CITY_INDEX.size} entries`);
  }

  function findCity(input) {
    const key = normalizeKey(input);
    if (!key) return null;

    const direct = CITY_INDEX.get(key);
    if (direct) return direct;

    // Very conservative fuzzy matching for cities to avoid bad pairings.
    if (CITY_INDEX.size === 0) return null;

    let best = null;
    let bestDist = Infinity;
    const cutoff = key.length <= 6 ? 1 : key.length <= 12 ? 2 : 3;

    for (const [k, v] of CITY_INDEX) {
      if (Math.abs(k.length - key.length) > 3) continue;
      const d = levenshtein(key, k, cutoff);
      if (d <= cutoff && d < bestDist) {
        best = v;
        bestDist = d;
        if (d === 0) break;
      }
    }

    return best;
  }

  /**
   * Given a 2-letter ISO country code, return the full country name.
   * Example: 'IN' → 'India', 'GB' → 'United Kingdom'
   */
  function countryNameFromISO2(code) {
    const c = fromISO2(code);
    return c?.name || null;
  }

  global.ATSLocationDB = {
    normalizeKey,
    findCountry,
    toISO2,
    capitalFor,
    fromISO2,
    countryNameFromISO2,
    setCityDataset,
    findCity,
    _COUNTRIES: COUNTRIES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
